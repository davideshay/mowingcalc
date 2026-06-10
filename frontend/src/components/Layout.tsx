import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import Brightness4Outlined from '@mui/icons-material/Brightness4Outlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import { useColorScheme } from '@mui/material/styles';

const DRAWER_WIDTH = 240;

const navItems = [
  { path: '/', label: 'Dashboard', icon: DashboardOutlined },
  { path: '/config', label: 'Configuration', icon: SettingsOutlined },
  { path: '/history', label: 'History', icon: CalendarMonthOutlined },
  { path: '/algorithm', label: 'Algorithm', icon: PsychologyOutlined },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode, setMode } = useColorScheme();

  const toggleMode = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo / Brand */}
      <Toolbar>
        <Typography variant="h6" component="div" noWrap>
          MowingCalc
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Smart Lawn Scheduler
        </Typography>
      </Toolbar>
      <Divider />

      {/* Navigation */}
      <List sx={{ flex: 1, pt: 2 }}>
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          const IconComponent = item.icon;
          return (
            <ListItem key={item.path} disablePadding sx={{ display: 'block', mb: 0.5 }}>
              <Link
                to={item.path}
                style={{ textDecoration: 'none', display: 'contents' }}
                onClick={() => !isDesktop && setMobileOpen(false)}
              >
                <ListItemButton selected={isActive}>
                  <ListItemIcon>
                    <IconComponent />
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </Link>
            </ListItem>
          );
        })}
      </List>

      {/* Sidebar footer */}
      <Divider />
      <Box sx={{ px: 2, py: 2 }}>
        <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <IconButton
            onClick={toggleMode}
            color="inherit"
            size="small"
            sx={{ mb: 1 }}
          >
            {mode === 'dark' ? <LightModeOutlined /> : <Brightness4Outlined />}
          </IconButton>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          Phase 4 - Web UI
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          v0.1.0
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Top AppBar for mobile */}
      <AppBar
        position="fixed"
        sx={{
          width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { lg: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { lg: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            MowingCalc
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      {!isDesktop && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
          }}
        >
          {drawer}
        </Drawer>
      )}

      {/* Desktop permanent Drawer */}
      {isDesktop && (
        <Box
          component="nav"
          sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }}
        >
          <Drawer
            variant="permanent"
            sx={{
              width: DRAWER_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: DRAWER_WIDTH,
                boxSizing: 'border-box',
              },
            }}
            open
          >
            {drawer}
          </Drawer>
        </Box>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: { xs: '56px', lg: 0 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
