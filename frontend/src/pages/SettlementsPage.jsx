import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getFriends, getSettlements, createSettlement } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeftRight, Plus, Calendar, ArrowRight } from 'lucide-react';

export default function SettlementsPage() {
  const { user } = useAuth();
  const [settlements, setSettlements] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const [settleRes, friendRes] = await Promise.all([
        getSettlements(user.id),
        getFriends(user.id),
      ]);
      setSettlements(settleRes);
      setFriends(friendRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitLoading(true);

    try {
      await createSettlement(user.id, {
        receiver_id: receiverId,
        amount: parseFloat(amount),
        date,
      });
      setDialogOpen(false);
      setReceiverId('');
      setAmount('');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to record settlement');
    } finally {
      setSubmitLoading(false);
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
          <h1 className="text-3xl font-bold tracking-tight">Settlements</h1>
          <p className="text-muted-foreground mt-1">
            Record and view payment settlements
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Record Settlement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record a Settlement</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Pay to</Label>
                <Select value={receiverId} onValueChange={setReceiverId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select friend" />
                  </SelectTrigger>
                  <SelectContent>
                    {friends.map((friend) => (
                      <SelectItem key={friend.id} value={friend.id}>
                        {friend.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="settle-amount">Amount</Label>
                <Input
                  id="settle-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="settle-date">Date</Label>
                <Input
                  id="settle-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitLoading || !receiverId}>
                {submitLoading ? 'Recording...' : 'Record Settlement'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Settlements List */}
      {settlements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No settlements yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Record a payment when you settle up with a friend
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {settlements.map((settlement) => (
            <Card key={settlement.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ArrowLeftRight className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {settlement.payer_id === user.id ? 'You' : settlement.payer_name}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {settlement.receiver_id === user.id ? 'You' : settlement.receiver_name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(settlement.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">₹{parseFloat(settlement.amount).toFixed(2)}</p>
                    <Badge variant="secondary" className="text-xs">
                      {settlement.payer_id === user.id ? 'You paid' : 'You received'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
