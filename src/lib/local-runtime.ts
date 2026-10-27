export const localRuntimeEnabled = () => process.env.BM_LOCAL_RUNTIME === "true" && process.env.NODE_ENV === "development";
export function localHTTPAllowed(url:URL){return localRuntimeEnabled() && url.protocol==="http:" && ["127.0.0.1","localhost","[::1]"].includes(url.hostname);}
export function localNoAuthEnabled(){if(!localRuntimeEnabled()||process.env.BM_LOCAL_NO_AUTH!=="true")return false;try{const url=new URL(process.env.APP_URL!);return localHTTPAllowed(url)&&url.port==="3020";}catch{return false;}}
