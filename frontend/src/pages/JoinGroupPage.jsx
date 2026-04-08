import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { joinGroup } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function JoinGroupPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!groupId || !user) return;

    const performJoin = async () => {
      try {
        await joinGroup(groupId, user.id);
        navigate(`/groups/${groupId}`, { replace: true });
      } catch (err) {
        setError(err.message || 'Failed to join group');
      }
    };

    performJoin();
  }, [groupId, user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
          {error ? (
            <div className="text-destructive">
              <span className="font-semibold text-lg">{error}</span>
              <br />
              <button onClick={() => navigate('/')} className="mt-4 underline hover:text-primary">
                Return to Dashboard
              </button>
            </div>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <h2 className="text-xl font-bold tracking-tight">Joining Group...</h2>
              <p className="text-muted-foreground">Please wait while we add you to the group.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
