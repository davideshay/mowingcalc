import { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Card,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

export type TabDef = {
  label: string;
  icon?: React.ElementType;
  value: string;
  content: React.ReactNode;
  disabled?: boolean;
};

export type TabbedPageProps = {
  title: string;
  subtitle?: string;
  tabs: TabDef[];
  defaultTab?: string;
  actions?: React.ReactNode;
  alert?: React.ReactNode;
  sx?: SxProps<Theme>;
};

function TabPanel({ children, value, index, sx }: {
  children: React.ReactNode;
  value: string;
  index: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== String(index)}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      sx={{ ...sx }}
    >
      {value === String(index) && children}
    </Box>
  );
}

export function TabbedPage({
  title,
  subtitle,
  tabs,
  defaultTab,
  actions,
  alert,
  sx,
}: TabbedPageProps) {
  const initialIndex = defaultTab
    ? tabs.findIndex((t) => t.value === defaultTab)
    : 0;
  const [tabIndex, setTabIndex] = useState(Math.max(0, initialIndex));

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 12, ...sx }}>
      {/* Sticky Header */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          py: 2,
          boxShadow: 1,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h4" component="h1">{title}</Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
            )}
          </Box>
          {actions && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {actions}
            </Box>
          )}
        </Box>
      </Box>

      {/* Optional Alert (validation results, status messages) */}
      {alert}

      {/* Tab Bar */}
      <Card elevation={0} sx={{ p: '0 !important', overflow: 'hidden' }}>
        <Tabs
          value={tabIndex}
          onChange={handleChange}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={title}
          sx={{
            minHeight: 48,
            '& .MuiTab-root': {
              minHeight: 48,
            },
          }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.value}
              icon={tab.icon ? <tab.icon fontSize="small" /> : undefined}
              iconPosition="start"
              label={tab.label}
              disabled={tab.disabled}
              id={`tab-${index}`}
              aria-controls={`tabpanel-${index}`}
            />
          ))}
        </Tabs>
      </Card>

      {/* Tab Panels */}
      {tabs.map((tab, index) => (
        <TabPanel key={tab.value} value={String(tabIndex)} index={index}>
          {tab.content}
        </TabPanel>
      ))}
    </Box>
  );
}
