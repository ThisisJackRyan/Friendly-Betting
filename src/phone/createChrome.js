'use client';

import { createContext, useContext, useMemo, useState } from 'react';

const CreateChromeContext = createContext({
  hidePhoneTabs: false,
  setHidePhoneTabs: () => {},
});

export function CreateChromeProvider({ children }) {
  const [hidePhoneTabs, setHidePhoneTabs] = useState(false);
  const value = useMemo(
    () => ({ hidePhoneTabs, setHidePhoneTabs }),
    [hidePhoneTabs],
  );
  return (
    <CreateChromeContext.Provider value={value}>
      {children}
    </CreateChromeContext.Provider>
  );
}

export function useCreateChrome() {
  return useContext(CreateChromeContext);
}
