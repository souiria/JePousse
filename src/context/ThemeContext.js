import Constants from 'expo-constants';
import { createContext, useContext } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Read the theme from your config
  const theme = Constants.expoConfig?.extra?.theme || {
    primary: '#000000',
    background: '#FFFFFF',
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);