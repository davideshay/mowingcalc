import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';

interface HAInputHelpers {
  enabled: boolean;
  nextMowNumber: string;
  growthEstimateNumber: string;
  rainDelayNumber: string;
  mowRecommendedBoolean: string;
  mowReasonSelect: string;
}

interface Props {
  helpers: HAInputHelpers;
  onChange: (helpers: HAInputHelpers) => void;
}

export function HAInputHelpersEditor({ helpers, onChange }: Props) {
  const update = (key: keyof HAInputHelpers, value: any) => {
    onChange({
      ...helpers,
      [key]: value,
    });
  };

  return (
    <Stack spacing={2}>
      <Alert severity="warning">
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          What are HA Input Helpers?
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Home Assistant Input Helpers are entities you create in HA that this app writes to. They let you build automations in HA based on the mowing algorithm&apos;s output.
        </Typography>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><code>input_boolean.mow_recommended</code> → True/False recommendation</li>
          <li><code>input_number.growth_estimate_mm</code> → Current grass growth</li>
          <li><code>input_select.mow_reason</code> → Text explanation</li>
        </ul>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Create these in HA: Settings → Devices &amp; Services → Helpers → Create Helper
        </Typography>
      </Alert>

      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              checked={helpers.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
            />
          }
          label="Enable HA Input Helpers"
        />
      </FormGroup>

      {helpers.enabled && (
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{ flexWrap: 'wrap', pl: 7 }}
        >
          <Box sx={{ flex: '1 1 250px' }}>
            <TextField
              fullWidth
              size="small"
              label="Next Mow Number"
              value={helpers.nextMowNumber}
              onChange={(e) => update('nextMowNumber', e.target.value)}
            />
          </Box>

          <Box sx={{ flex: '1 1 250px' }}>
            <TextField
              fullWidth
              size="small"
              label="Growth Estimate Number"
              value={helpers.growthEstimateNumber}
              onChange={(e) => update('growthEstimateNumber', e.target.value)}
            />
          </Box>

          <Box sx={{ flex: '1 1 250px' }}>
            <TextField
              fullWidth
              size="small"
              label="Rain Delay Number"
              value={helpers.rainDelayNumber}
              onChange={(e) => update('rainDelayNumber', e.target.value)}
            />
          </Box>

          <Box sx={{ flex: '1 1 250px' }}>
            <TextField
              fullWidth
              size="small"
              label="Mow Recommended Boolean"
              value={helpers.mowRecommendedBoolean}
              onChange={(e) => update('mowRecommendedBoolean', e.target.value)}
            />
          </Box>

          <Box sx={{ flex: '1 1 250px' }}>
            <TextField
              fullWidth
              size="small"
              label="Mow Reason Select"
              value={helpers.mowReasonSelect}
              onChange={(e) => update('mowReasonSelect', e.target.value)}
            />
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
