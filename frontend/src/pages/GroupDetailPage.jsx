import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getGroup, getGroupExpenses } from '@/lib/db';
import { calculateBalances } from '@/lib/calculator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AddExpenseDialog from '@/components/AddExpenseDialog';
import { Receipt, Calendar, Users, Link2, TrendingDown, TrendingUp, RefreshCcw } from 'lucide-react';

export default function GroupDetailPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (user && groupId) loadData();
  }, [user, groupId]);

  const loadData = async () => {
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      
      const exps = await getGroupExpenses(groupId);
      setExpenses(exps);

      // Compute balances specific to this group using the native JS engine
      try {
        const calculatedBals = calculateBalances(user.id, exps, []);
        setBalances(calculatedBals || []);
      } catch (err) {
        console.error('Failed to calculate group balances', err);
        setBalances([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyJoinLink = () => {
    const link = `${window.location.origin}/join-group/${groupId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    });
  };

  const getMemberName = (userId) => {
    const member = group?.resolvedMembers?.find((f) => f.id === userId);
    return member?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!group) {
    return <div className="text-center text-muted-foreground mt-8">Group not found.</div>;
  }

  const totalOwed = balances.filter((b) => b.amount < 0).reduce((s, b) => s + Math.abs(b.amount), 0);
  const totalToReceive = balances.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
            <Badge variant="outline" className="ml-2 bg-muted/50">
              <Users className="h-3 w-3 mr-1" />
              {group.resolvedMembers.length}
            </Badge>
          </div>
          <div className="text-muted-foreground mt-2 text-sm flex flex-wrap gap-1">
            <span className="mr-1">Members:</span>
            {group.resolvedMembers.map((m, i) => (
              <span key={m.id} className="font-medium text-foreground">
                {m.name}{i < group.resolvedMembers.length - 1 ? ',' : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyJoinLink}>
            <Link2 className="h-4 w-4 mr-2" />
            {copying ? 'Copied!' : 'Share Link'}
          </Button>
          <AddExpenseDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSuccess={loadData}
            initialGroupId={groupId}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-destructive/5 border-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive/80">You owe overall</p>
                <p className="text-2xl font-bold text-destructive">₹{totalOwed.toFixed(2)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-destructive/50" />
            </div>
            {balances.filter(b => b.amount < 0).length > 0 && (
              <div className="mt-4 pt-4 border-t border-destructive/10 space-y-1">
                {balances.filter(b => b.amount < 0).map(b => (
                  <p key={b.user_id} className="text-sm text-destructive">
                    You owe {getMemberName(b.user_id)} <strong>₹{Math.abs(b.amount).toFixed(2)}</strong>
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary/80">You are owed overall</p>
                <p className="text-2xl font-bold text-primary">₹{totalToReceive.toFixed(2)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary/50" />
            </div>
            {balances.filter(b => b.amount > 0).length > 0 && (
              <div className="mt-4 pt-4 border-t border-primary/10 space-y-1">
                {balances.filter(b => b.amount > 0).map(b => (
                  <p key={b.user_id} className="text-sm text-primary">
                    {getMemberName(b.user_id)} owes you <strong>₹{b.amount.toFixed(2)}</strong>
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expenses List */}
      <div>
        <h2 className="text-xl font-bold mb-4">Group Expenses</h2>
        {expenses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-4 opacity-50" />
              <p>No expenses in this group yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => {
              // Determine if the current user borrowed or lent for THIS specific expense
              const iPaid = expense.payers.find(p => p.user_id === user.id)?.amount || 0;
              const iOwe = expense.participants.find(p => p.user_id === user.id)?.share_amount || 0;
              const netEffect = iPaid - iOwe;

              return (
                <Card key={expense.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                         <div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center">
                           <Receipt className="h-5 w-5 text-muted-foreground" />
                         </div>
                         <div>
                           <p className="font-semibold text-lg">{expense.title}</p>
                           <p className="text-sm text-muted-foreground">{expense.payer_name} paid ₹{parseFloat(expense.amount).toFixed(2)}</p>
                           <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                             <Calendar className="h-3 w-3" />
                             {new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                           </p>
                         </div>
                      </div>
                      <div className="text-right shrink-0">
                         {netEffect !== 0 ? (
                           <>
                             <p className={`text-xs ${netEffect > 0 ? 'text-primary' : 'text-destructive'}`}>
                               {netEffect > 0 ? 'you lent' : 'you borrowed'}
                             </p>
                             <p className={`font-bold ${netEffect > 0 ? 'text-primary' : 'text-destructive'}`}>
                               ₹{Math.abs(netEffect).toFixed(2)}
                             </p>
                           </>
                         ) : (
                           <p className="text-sm text-muted-foreground mt-1">not involved</p>
                         )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
