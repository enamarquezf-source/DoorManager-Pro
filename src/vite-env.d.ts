/// <reference types="vite/client" />

declare const __DMP_BUILD_VERSION__: string;
declare const __DMP_BUILD_COMMIT__: string;
declare const __DMP_BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_LOCAL_AUTH_ENABLED?: string;
  readonly VITE_LOCAL_AUTH_ACCESS_KEY?: string;
  readonly VITE_SUPABASE_DIAGNOSTICS?: string;
}
