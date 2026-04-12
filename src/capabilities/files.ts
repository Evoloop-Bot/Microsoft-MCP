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
// These would survive URL normalisation and could redirect the request to a
// different Graph endpoint.
function noRelativeSegments(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  return !value.split("/").some((seg) => {
    try {
      const decoded = decodeURIComponent(seg);
      return decoded === ".." || decoded === ".";
    } catch {
      return true; // reject malformed percent-encoding
    }
  });
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
    apiPath = `/me/drive/root:${input.path}:/children`;
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
  const metaPath = input.itemId
    ? `/me/drive/items/${encodeURIComponent(input.itemId)}`
    : `/me/drive/root:${input.path}`;

  const meta = await client.request<DriveItem>(metaPath, {
    query: { $select: "id,name,file,size,@microsoft.graph.downloadUrl" }
  });

  const mimeType = meta.file?.mimeType ?? null;
  const downloadUrl = meta["@microsoft.graph.downloadUrl"] ?? null;
  const isTextType = mimeType ? /^text\//.test(mimeType) || mimeType === "application/json" : false;
  const withinSizeLimit = typeof meta.size === "number" && meta.size <= input.maxBytes;

  let contentText: string | null = null;

  if (isTextType && withinSizeLimit && downloadUrl) {
    // Fetch raw content — use download URL directly (no auth header needed for pre-authenticated download URL)
    const res = await fetch(downloadUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      contentText = new TextDecoder().decode(new Uint8Array(buf).slice(0, input.maxBytes));
    }
  }

  // Only surface the pre-authenticated download URL when content could not be inlined,
  // to avoid returning a credential-free URL alongside readable content unnecessarily.
  return { id: meta.id, name: meta.name, mimeType, contentText, downloadUrl: contentText !== null ? null : downloadUrl };
}
