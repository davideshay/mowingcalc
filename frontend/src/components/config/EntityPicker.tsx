import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';

// HA entity type (from our API)
export interface HAEntity {
  entity_id: string;
  state: string;
  unit_of_measurement: string | null;
  friendly_name: string | null;
}

function getLabel(option: HAEntity | string) {
  return typeof option === 'string' ? option : option.entity_id;
}

// Single-entity picker — sets value directly (not add-to-group)
export function EntityPicker({
  options,
  loading,
  value,
  onChange,
  onRefresh,
  placeholder,
  label,
  helperText,
}: {
  options: HAEntity[];
  loading: boolean;
  value: string;
  onChange: (entityId: string) => void;
  onRefresh: () => void;
  placeholder: string;
  label: string;
  helperText?: string;
}) {
  const findOption = (id: string) => options.find((o) => o.entity_id === id) || null;
  // Use null (not '') for empty — MUI Autocomplete treats '' as "has value" which
  // prevents the label from floating. null lets the label float properly.
  const selectedOption = value ? findOption(value) ?? null : null;
  // inputValue should reflect the configured value even before options load,
  // so the label floats correctly and the field shows the existing entity_id.
  const [inputValue, setInputValue] = useState(value);

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%' }}>
      <Autocomplete
        freeSolo
        options={options}
        getOptionLabel={(option) => getLabel(option)}
        isOptionEqualToValue={(option, val) => {
          if (val == null) return false;
          if (typeof option === 'string') return option === val;
          if (typeof val === 'string') return option.entity_id === val;
          return option.entity_id === val?.entity_id;
        }}
        value={selectedOption}
        inputValue={inputValue}
        onInputChange={(_e, newValue) => setInputValue(newValue)}
        onChange={(_e, newValue) => {
          const id = typeof newValue === 'string' ? newValue : (newValue as HAEntity | null)?.entity_id || '';
          setInputValue(id);
          onChange(id);
        }}
        loading={loading}
        sx={{ flex: 1 }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            helperText={helperText}
            slotProps={{
              ...params.slotProps,
              inputLabel: { shrink: true },
              input: {
                ...params.slotProps?.input,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={6} /> : params.slotProps?.input?.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
        renderOption={(props, option) => (
          <Box component="li" {...props}>
            {typeof option === 'string' ? (
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {option}
              </Typography>
            ) : (
              <>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {option.entity_id}
                  </Typography>
                  {option.friendly_name && option.friendly_name !== option.entity_id && (
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      ({option.friendly_name})
                    </Typography>
                  )}
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: option.state === 'unavailable' ? 'warning.main' : 'success.main',
                    fontWeight: 600,
                  }}
                >
                  {option.state}
                </Typography>
              </>
            )}
          </Box>
        )}
      />
      <IconButton
        size="small"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh entities"
        title="Refresh entity list"
        sx={{ mt: 1.5 }}
      >
        <RefreshOutlined fontSize="small" />
      </IconButton>
    </Box>
  );
}
