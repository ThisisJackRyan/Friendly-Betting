const navigation = {
  pathname: '/',
  params: {},
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};

function usePathname() {
  return navigation.pathname;
}

function useParams() {
  return navigation.params;
}

const router = {
  push: navigation.push,
  replace: navigation.replace,
  back: navigation.back,
  prefetch: jest.fn(),
};

function useRouter() {
  return router;
}

function redirect(url) {
  const error = new Error(`NEXT_REDIRECT:${url}`);
  throw error;
}

module.exports = {
  navigation,
  usePathname,
  useParams,
  useRouter,
  redirect,
};
