import { apiRequest, getAuthToken } from '../api/client.ts';

/**
 * Backend REST study bookmark helpers (replaces Firebase/Firestore).
 * Stores candidate study bookmarks in the PostgreSQL / backend store via /api/v1/bookmarks.
 */

export interface FirestoreBookmarkDoc {
  id: string;
  userId: string;
  testId: string;
  note: string;
}

export async function syncUserProfileToFirestore(_params: {
  uid: string;
  fullName: string;
  email: string;
  role: 'student' | 'admin';
}): Promise<void> {
  // Profile is persisted directly in PostgreSQL / Supabase via /api/v1/auth
}

export async function listUserBookmarksFromFirestore(
  _userId: string
): Promise<FirestoreBookmarkDoc[]> {
  if (!getAuthToken()) return [];
  try {
    const res = await apiRequest<{
      bookmarks: Array<{
        id: string;
        userId?: string;
        user_id?: string;
        testId?: string;
        test_id?: string;
        note: string;
      }>;
    }>('/api/v1/bookmarks/my');

    return (res.bookmarks || []).map((b) => ({
      id: b.id,
      userId: b.userId || b.user_id || '',
      testId: b.testId || b.test_id || '',
      note: b.note || '',
    }));
  } catch (err) {
    console.error('Failed to load study bookmarks:', err);
    return [];
  }
}

export async function saveUserBookmarkToFirestore(params: {
  userId: string;
  testId: string;
  note: string;
}): Promise<void> {
  if (!getAuthToken()) return;
  await apiRequest('/api/v1/bookmarks', {
    method: 'POST',
    body: JSON.stringify({
      testId: params.testId,
      note: params.note.trim().slice(0, 500),
    }),
  });
}

export async function deleteUserBookmarkFromFirestore(
  _userId: string,
  testId: string
): Promise<void> {
  if (!getAuthToken()) return;
  await apiRequest(`/api/v1/bookmarks/${encodeURIComponent(testId)}`, {
    method: 'DELETE',
  });
}
