import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#16a34a',
          light: '#4ade80',
          dark: '#15803d',
          contrastText: '#ffffff',
        },
        secondary: {
          main: '#65a30d',
          light: '#a3e635',
          dark: '#4d7c0f',
          contrastText: '#ffffff',
        },
        error: {
          main: '#ef4444',
          light: '#fca5a5',
          dark: '#dc2626',
        },
        warning: {
          main: '#f59e0b',
          light: '#fcd34d',
          dark: '#d97706',
        },
        info: {
          main: '#3b82f6',
          light: '#93c5fd',
          dark: '#2563eb',
        },
        success: {
          main: '#22c55e',
          light: '#86efac',
          dark: '#16a34a',
        },
        background: {
          default: '#f9fafb',
          paper: '#ffffff',
        },
        text: {
          primary: '#111827',
          secondary: '#4b5563',
          disabled: '#9ca3af',
        },
        divider: '#e5e7eb',
        action: {
          disabledBackground: '#f3f4f6',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#4ade80',
          light: '#86efac',
          dark: '#22c55e',
          contrastText: '#022c22',
        },
        secondary: {
          main: '#a3e635',
          light: '#d9f99d',
          dark: '#65a30d',
        },
        error: {
          main: '#fca5a5',
          light: '#fecaca',
          dark: '#ef4444',
        },
        warning: {
          main: '#fcd34d',
          light: '#fde68a',
          dark: '#f59e0b',
        },
        info: {
          main: '#93c5fd',
          light: '#bfdbfe',
          dark: '#3b82f6',
        },
        success: {
          main: '#86efac',
          light: '#bbf7d0',
          dark: '#22c55e',
        },
        background: {
          default: '#111827',
          paper: '#1f2937',
        },
        text: {
          primary: '#f3f4f6',
          secondary: '#d1d5db',
          disabled: '#6b7280',
        },
        divider: '#374151',
        action: {
          disabledBackground: '#374151',
        },
      },
    },
  },
  typography: {
    fontFamily: '"Inter", "system-ui", "-apple-system", "sans-serif"',
    h4: {
      fontWeight: 700,
      fontSize: '1.5rem',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.25rem',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.8125rem',
    },
    caption: {
      fontSize: '0.75rem',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 12,
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)'
              : '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        }),
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderBottom: `1px solid ${theme.palette.divider}`,
        }),
        head: {
          fontWeight: 600,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'primary.light',
            '&:hover': {
              backgroundColor: 'primary.main',
            },
            '& .MuiTypography-root, & .MuiListItemIcon-root': {
              color: 'primary.main',
            },
          },
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          '& .MuiTypography-root': {
            color: 'text.primary',
            fontWeight: 500,
          },
          '& .MuiListItemIcon-root': {
            color: 'text.secondary',
          },
          // Reset <a> element colors from react-router-dom
          '& a': {
            color: 'inherit',
            textDecoration: 'none',
          },
          '& a .MuiTypography-root': {
            color: 'text.primary',
          },
          '& a.Mui-selected .MuiTypography-root': {
            color: 'primary.main',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 32,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          minHeight: 32,
          padding: '6px 12px',
        },
      },
    },
  },
});

export default theme;
