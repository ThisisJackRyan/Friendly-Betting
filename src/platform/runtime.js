import { Capacitor } from '@capacitor/core';

export const PROD_ORIGIN = 'https://www.friendly-bets.com';
export const isNativeApp = () => Capacitor.isNativePlatform();
