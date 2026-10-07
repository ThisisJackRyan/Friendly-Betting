import { Capacitor } from '@capacitor/core';

export const PROD_ORIGIN = 'https://friendly-betting-teal.vercel.app';
export const isNativeApp = () => Capacitor.isNativePlatform();
