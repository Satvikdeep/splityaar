import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginWithGoogle } = useAuth();

  const handleGoogleSignin = async () => {
    try {
      setError('');
      setLoading(true);
      await loginWithGoogle();
      // Wait. The AuthContext and PublicRoute automatically handle the redirect when `user` populates!
    } catch (err) {
      setError(err.message || 'Google Login failed');
      setLoading(false); // Only unset loading on error, so UI remains "Signing in..." until unmounted
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center">
            <Wallet className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="text-3xl font-bold tracking-tight">SplitYaar</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription>
              Sign in to start splitting expenses with friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <Button onClick={handleGoogleSignin} disabled={loading} className="w-full">
                {loading ? 'Signing in...' : 'Sign in with Google'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
