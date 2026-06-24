import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import { EntityPicker } from './EntityPicker';
import { useHAEntities } from '../../hooks/useApi';

interface HAInputHelpers {
  enabled: boolean;
  nextMowDateTime: string;
  growthEstimateNumber: string;
  rainDelayNumber: string;
  mowRecommendedBoolean: string;
  mowReasonText: string;
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

  // Fetch entities by domain
  const { entities: datetimeEntities, loading: datetimesLoading, refetch: refetchDatetimes } = useHAEntities('input_datetime');
  const { entities: numberEntities, loading: numbersLoading, refetch: refetchNumbers } = useHAEntities('input_number');
  const { entities: booleanEntities, loading: booleansLoading, refetch: refetchBooleans } = useHAEntities('input_boolean');
  const { entities: textEntities, loading: textsLoading, refetch: refetchTexts } = useHAEntities('input_text');

  return (
    <Stack spacing={2}>
      <Alert severity="warning">
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          What are HA Input Helpers?
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Home Assistant Input Helpers are entities you create in HA that this app writes to. They let you build automations in HA based on the mowing algorithm&apos;s output.
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          These helpers are updated every time the algorithm runs (default: every 15 minutes), <strong>even in read-only mode</strong>. They are purely informational — read-only mode only blocks actual mower control.
        </Typography>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><code>input_boolean.mow_recommended</code> → True/False recommendation</li>
          <li><code>input_number.growth_estimate_mm</code> → Current grass growth</li>
          <li><code>input_text.mow_reason</code> → Text explanation</li>
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
        <Grid container spacing={2} sx={{ pl: 7 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <EntityPicker
              options={datetimeEntities}
              loading={datetimesLoading}
              value={helpers.nextMowDateTime}
              onChange={(id) => update('nextMowDateTime', id)}
              onRefresh={refetchDatetimes}
              placeholder="Select input_datetime..."
              label="Next Mow DateTime"
              helperText="input_datetime helper for predicted next mow time."
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <EntityPicker
              options={numberEntities}
              loading={numbersLoading}
              value={helpers.growthEstimateNumber}
              onChange={(id) => update('growthEstimateNumber', id)}
              onRefresh={refetchNumbers}
              placeholder="Select input_number..."
              label="Growth Estimate Number"
              helperText="input_number helper for current grass growth estimate."
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <EntityPicker
              options={numberEntities}
              loading={numbersLoading}
              value={helpers.rainDelayNumber}
              onChange={(id) => update('rainDelayNumber', id)}
              onRefresh={refetchNumbers}
              placeholder="Select input_number..."
              label="Rain Delay Number"
              helperText="input_number helper for rain delay remaining hours."
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <EntityPicker
              options={booleanEntities}
              loading={booleansLoading}
              value={helpers.mowRecommendedBoolean}
              onChange={(id) => update('mowRecommendedBoolean', id)}
              onRefresh={refetchBooleans}
              placeholder="Select input_boolean..."
              label="Mow Recommended Boolean"
              helperText="input_boolean helper — set True when mowing is recommended."
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <EntityPicker
              options={textEntities}
              loading={textsLoading}
              value={helpers.mowReasonText}
              onChange={(id) => update('mowReasonText', id)}
              onRefresh={refetchTexts}
              placeholder="Select input_text..."
              label="Mow Reason Text"
              helperText="input_text helper — set to current mow decision reason."
            />
          </Grid>
        </Grid>
      )}
    </Stack>
  );
}
