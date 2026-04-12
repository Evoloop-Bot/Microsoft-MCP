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

// ---------- files_list_items ----------

export const filesListItemsInputSchema = z.object({
  driveId: z.string().optional().describe("OneDrive drive ID. Defaults to the user's default drive."),
  itemId: z.string().optional().describe("Folder item ID to list. Mutually exclusive with path."),
  path: z.string().optional().describe("Folder path relative to root (e.g. /Documents). Mutually exclusive with itemId.")
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
  let path: string;

  if (input.driveId) {
    if (input.itemId) {
      path = `/drives/${input.driveId}/items/${input.itemId}/children`;
    } else if (input.path) {
      path = `/drives/${input.driveId}/root:${input.path}:/children`;
    } else {
      path = `/drives/${input.driveId}/root/children`;
    }
  } else {
    if (input.itemId) {
      path = `/me/drive/items/${input.itemId}/children`;
    } else if (input.path) {
      path = `/me/drive/root:${input.path}:/children`;
    } else {
      path = "/me/drive/root/children";
    }
  }

  const response = await client.request<{ value: DriveItem[] }>(path, {
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
  driveId: z.string().optional().describe("OneDrive drive ID. Defaults to the user's default drive."),
  itemId: z.string().optional().describe("Item ID. Mutually exclusive with path."),
  path: z.string().optional().describe("File path relative to root. Mutually exclusive with itemId."),
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
  let metaPath: string;

  if (input.driveId) {
    metaPath = input.itemId
      ? `/drives/${input.driveId}/items/${input.itemId}`
      : `/drives/${input.driveId}/root:${input.path}`;
  } else {
    metaPath = input.itemId
      ? `/me/drive/items/${input.itemId}`
      : `/me/drive/root:${input.path}`;
  }

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
