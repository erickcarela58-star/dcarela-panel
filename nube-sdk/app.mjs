const apps=[];
export function initializeApp(options,name='[DEFAULT]'){const app={options,name};apps.push(app);return app;}
export const getApps=()=>apps;
export const getApp=()=>apps[0]||initializeApp(globalThis.__DCARELA_FIREBASE_CONFIG||{});
