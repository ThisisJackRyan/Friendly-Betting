import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export { useParams } from 'react-router-dom';
export function usePathname() {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => ({
    push: (path) => navigate(path),
    replace: (path) => navigate(path, { replace: true }),
    back: () => window.history.state?.idx > 0 ? navigate(-1) : navigate('/bets', { replace: true }),
  }), [navigate]);
}
