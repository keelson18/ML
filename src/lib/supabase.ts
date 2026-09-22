// This file is kept for backwards compatibility. The app now uses the backend API
// layer (src/api/) instead of direct Supabase client access. Token management
// is handled by src/api/client.ts.
export { getAuthToken, setAuthToken } from '../api/client';
