import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';
import { isNativeApp } from '../src/platform/runtime';
import { appPathFromUrl } from './deepLinks';

export default function NativeLifecycle() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, pathname]);

  useEffect(() => {
    if (!isNativeApp()) return undefined;
    document.documentElement.classList.add('native-app');
    let active = true;
    const listeners = [];
    const attach = async (event, callback) => {
      const listener = await App.addListener(event, callback);
      if (active) listeners.push(listener);
      else await listener.remove();
    };
    const open = ({ url }) => {
      const path = appPathFromUrl(url);
      if (active && path) navigateRef.current(path);
    };
    const start = async () => {
      await attach('appUrlOpen', open);
      const launch = await App.getLaunchUrl();
      if (launch) open(launch);
      await attach('backButton', () => {
        if (window.history.state?.idx > 0) navigateRef.current(-1);
        else if (window.location.pathname !== '/') navigateRef.current('/', { replace: true });
        else App.minimizeApp();
      });
    };
    start().catch(() => { /* Ordinary in-app navigation remains available. */ });
    return () => {
      active = false;
      listeners.forEach((listener) => listener.remove());
    };
  }, []);
  return null;
}
