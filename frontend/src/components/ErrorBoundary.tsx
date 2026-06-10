import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertTitle, Button, Card, CardContent, Typography } from '@mui/material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <Card sx={{ my: 2 }}>
            <CardContent>
              <Alert severity="error" variant="filled" sx={{ mb: 2 }}>
                <AlertTitle>Something went wrong</AlertTitle>
                <Typography component="span">{this.state.error?.message}</Typography>
              </Alert>
              <Button
                variant="contained"
                color="primary"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        )
      );
    }

    return this.props.children;
  }
}
