import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getFriends, addFriend } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UserPlus, Users, Mail } from 'lucide-react';

export default function FriendsPage() {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [addLoading, setAddLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const f = await getFriends(user.id);
      setFriends(f);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setAddLoading(true);

    try {
      const added = await addFriend(user.id, email);
      setSuccess(`${added.name} added as friend!`);
      setEmail('');
      loadData();
      setTimeout(() => {
        setDialogOpen(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to add friend');
    } finally {
      setAddLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Friends</h1>
          <p className="text-muted-foreground mt-1">
            Manage your friends
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Friend
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a Friend</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddFriend} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="friend-email">Friend's Email</Label>
                <Input
                  id="friend-email"
                  type="email"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}
              {success && (
                <div className="text-sm text-primary bg-primary/10 px-3 py-2 rounded-lg">
                  {success}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={addLoading}>
                {addLoading ? 'Adding...' : 'Add Friend'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Friends List */}
      {friends.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No friends yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add friends by their email to start splitting expenses
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {friends.map((friend) => {
            return (
              <Card key={friend.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                        {friend.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{friend.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {friend.email}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
