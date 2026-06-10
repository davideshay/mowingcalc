import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';

interface Props {
  haUrl: string;
  haToken: string;
  onChange: (updates: { haUrl?: string; haToken?: string }) => void;
}

export function HAConnectionSection({ haUrl, haToken, onChange }: Props) {
  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Home Assistant Connection
        </Typography>

        <Alert severity="info" sx={{ mb: 3 }}>
          Enter your Home Assistant URL and API token. The token can be found in HA under
          Profile → Create Token (Long-Lived Access Token).
        </Alert>

        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Box sx={{ flex: '1 1 250px' }}>
            <TextField
              fullWidth
              label="HA URL"
              type="url"
              value={haUrl}
              onChange={(e) => onChange({ haUrl: e.target.value })}
              placeholder="http://homeassistant.local:8123"
              size="small"
            />
          </Box>
          <Box sx={{ flex: '1 1 250px' }}>
            <TextField
              fullWidth
              label="HA API Token"
              type="password"
              value={haToken}
              onChange={(e) => onChange({ haToken: e.target.value })}
              placeholder="eyJ0eXAi..."
              size="small"
            />
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
