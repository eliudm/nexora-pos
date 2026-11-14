import React, { createContext, useContext, useState } from 'react';

export interface SessionUser {
  id: number;
  name: string;
  role: 'ADMIN' | 'CASHIER';
}

interface SessionContextValue {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  setUser: () => {},
});

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  return (
    <SessionContext.Provider value={{ user, setUser }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => useContext(SessionContext);
