'use client';

import { createContext, useContext, useMemo, useState } from 'react';

const CreateChromeContext = createContext({
  hidePhoneTabs: false,
  setHidePhoneTabs: () => {},
  pinPhoneTabs: false,
  setPinPhoneTabs: () => {},
});

export function CreateChromeProvider({ children }) {
  const [hidePhoneTabs, setHidePhoneTabs] = useState(false);
  const [pinPhoneTabs, setPinPhoneTabs] = useState(false);
  const value = useMemo(
    () => ({
      hidePhoneTabs,
      setHidePhoneTabs,
      pinPhoneTabs,
      setPinPhoneTabs,
    }),
    [hidePhoneTabs, pinPhoneTabs],
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
