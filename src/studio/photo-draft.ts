import { z } from 'zod';

const draftSchema = z.object({
  file: z.instanceof(File),
  sceneId: z.enum(['chandelier', 'after-hours']),
  consent: z.boolean(),
  requestId: z.string().uuid(),
  savedAt: z.number(),
});
export type PhotoDraft = z.infer<typeof draftSchema>;

// 草稿只留在当前浏览器；跨登录、付款跳转恢复时不自动提交。
async function openDraftStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('burning-bridges-photo-draft', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          'Your browser could not open the photo draft. Please allow site storage.'
        )
      );
    request.onblocked = () =>
      reject(new Error('Close other studio tabs to update the photo draft.'));
  });
}

async function writeDraft(draft: PhotoDraft | null) {
  const database = await openDraftStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      if (draft) store.put(draftSchema.parse(draft), 'latest');
      else store.delete('latest');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          new Error(
            'Your photo draft could not be saved. Please allow site storage and try again.'
          )
        );
      transaction.onabort = () =>
        reject(
          new Error('Your photo draft was interrupted. Please try again.')
        );
    });
  } finally {
    database.close();
  }
}

export function savePhotoDraft(draft: PhotoDraft) {
  return writeDraft(draft);
}
export function clearPhotoDraft() {
  return writeDraft(null);
}

export async function readPhotoDraft() {
  const database = await openDraftStore();
  let stored: unknown;
  try {
    stored = await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction('drafts')
        .objectStore('drafts')
        .get('latest');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new Error('Your saved photo could not be restored. Choose it again.')
        );
    });
  } finally {
    database.close();
  }
  if (stored === undefined) return null;
  const draft = draftSchema.safeParse(stored);
  if (!draft.success || Date.now() - draft.data.savedAt > 24 * 60 * 60_000) {
    await clearPhotoDraft();
    return null;
  }
  return draft.data;
}
