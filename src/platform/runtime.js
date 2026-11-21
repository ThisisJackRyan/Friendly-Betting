import { Capacitor } from '@capacitor/core';

export { PROD_ORIGIN } from './origin';
export const isNativeApp = () => Capacitor.isNativePlatform();
