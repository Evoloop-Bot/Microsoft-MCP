import { z } from "zod";
import type { GraphClient } from "../graph/client.js";

interface DriveItem {
  id: string;
  name: string;
  file?: { mimeType?: string };
  folder?: Record<string, unknown>;
  size?: number;
  webUrl: string;
  lastModifiedDateTime: string;
  "@microsoft.graph.downloadUrl"?: string;
}

// Reject path strings that contain relative segments (.. or .) after decoding.
// The entire path is decoded first so that encoded separators (%2f) and encoded
// dots (%2e) are resolved before the segment check — otherwise patterns like
// "foo%2f..%2fbar" or "%2e%2e%2fsecrets" bypass a split-then-decode approach.
function noRelativeSegments(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  const decoded = decodePath(value);
  return !decoded.split("/").some((seg) => seg === ".." || seg === ".");
}

function encodeDrivePath(value: string): string {
  const decoded = decodePath(value);
  if (decoded === "/" || decoded === "") {
    return "/";
  }

  const hasLeadingSlash = decoded.startsWith("/");
  const encodedSegments = decoded
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));

  return `${hasLeadingSlash ? "/" : ""}${encodedSegments.join("/")}`;
}

function decodePath(value: string): string {
  return decodeURIComponent(value.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
}

// ---------- files_list_items ----------

// files capability is scoped to the signed-in user's OneDrive for the pilot.
// External driveId (SharePoint drives) is excluded until allowlist enforcement
// is implemented. See MSM-18 security review for context.
export const filesListItemsInputSchema = z.object({
  itemId: z.string().optional().describe("Folder item ID to list. Mutually exclusive with path."),
  path: z.string().optional()
    .refine(noRelativeSegments, "Path must not contain relative segments (.. or .)")
    .describe("Folder path relative to root (e.g. /Documents). Mutually exclusive with itemId.")
}).refine((v) => !(v.itemId !== undefined && v.path !== undefined), {
  message: "Provide itemId or path, not both."
});

export type FilesListItemsInput = z.infer<typeof filesListItemsInputSchema>;

export interface FilesListItemsOutput {
  items: {
    id: string;
    name: string;
    type: "file" | "folder";
    size: number | null;
    webUrl: string;
    lastModifiedDateTime: string;
  }[];
}

export async function filesListItems(client: GraphClient, input: FilesListItemsInput): Promise<FilesListItemsOutput> {
  let apiPath: string;

  if (input.itemId) {
    apiPath = `/me/drive/items/${encodeURIComponent(input.itemId)}/children`;
  } else if (input.path) {
    const drivePath = encodeDrivePath(input.path);
    apiPath = drivePath === "/" ? "/me/drive/root/children" : `/me/drive/root:${drivePath}:/children`;
  } else {
    apiPath = "/me/drive/root/children";
  }

  const response = await client.request<{ value: DriveItem[] }>(apiPath, {
    query: { $select: "id,name,file,folder,size,webUrl,lastModifiedDateTime", $top: 100 }
  });

  return {
    items: response.value.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.folder ? "folder" : "file",
      size: item.size ?? null,
      webUrl: item.webUrl,
      lastModifiedDateTime: item.lastModifiedDateTime
    }))
  };
}

// ---------- files_read ----------

const MAX_INLINE_BYTES = 512 * 1024; // 512 KB

export const filesReadInputSchema = z.object({
  itemId: z.string().optional().describe("Item ID. Mutually exclusive with path."),
  path: z.string().optional()
    .refine(noRelativeSegments, "Path must not contain relative segments (.. or .)")
    .describe("File path relative to root. Mutually exclusive with itemId."),
  maxBytes: z.number().int().min(1).max(MAX_INLINE_BYTES).default(65536).describe("Maximum inline content bytes (default 64 KB, max 512 KB).")
}).refine((v) => !(v.itemId !== undefined && v.path !== undefined), {
  message: "Provide itemId or path, not both."
}).refine((v) => v.itemId !== undefined || v.path !== undefined, {
  message: "Provide itemId or path."
});

export type FilesReadInput = z.infer<typeof filesReadInputSchema>;

export interface FilesReadOutput {
  id: string;
  name: string;
  mimeType: string | null;
  contentText: string | null;
  downloadUrl: string | null;
}

export async function filesRead(client: GraphClient, input: FilesReadInput): Promise<FilesReadOutput> {
  const drivePath = input.path ? encodeDrivePath(input.path) : undefined;
  const metaPath = input.itemId
    ? `/me/drive/items/${encodeURIComponent(input.itemId)}`
    : drivePath === "/" ? "/me/drive/root" : `/me/drive/root:${drivePath}`;

  const meta = await client.request<DriveItem>(metaPath, {
    query: { $select: "id,name,file,size,@microsoft.graph.downloadUrl" }
  });

  const mimeType = meta.file?.mimeType ?? null;
  const downloadUrl = meta["@microsoft.graph.downloadUrl"] ?? null;
  const isTextType = mimeType ? /^text\//.test(mimeType) || mimeType === "application/json" : false;
  const withinSizeLimit = typeof meta.size === "number" && meta.size <= input.maxBytes;

  let contentText: string | null = null;

  if (isTextType && withinSizeLimit && downloadUrl) {
    // Fetch raw content using the pre-authenticated download URL (no auth header needed).
    // Apply an AbortController timeout matching the configured Graph client timeout so
    // slow connections do not hang indefinitely. On timeout or network error, fall through
    // to return downloadUrl so the caller can retrieve content out-of-band.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), client.httpTimeoutMs);
    try {
      const res = await fetch(downloadUrl, { signal: controller.signal });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        contentText = new TextDecoder().decode(new Uint8Array(buf).slice(0, input.maxBytes));
      }
    } catch {
      // Timeout or network error — contentText stays null; downloadUrl is returned below.
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Only surface the pre-authenticated download URL when content could not be inlined,
  // to avoid returning a credential-free URL alongside readable content unnecessarily.
  return { id: meta.id, name: meta.name, mimeType, contentText, downloadUrl: contentText !== null ? null : downloadUrl };
}
