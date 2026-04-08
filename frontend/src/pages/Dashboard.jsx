import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getExpenses, getSettlements, getFriends } from '@/lib/db';
import { calculateBalances } from '@/lib/calculator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  Calendar,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [balances, setBalances] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const [expRes, settleRes, friendRes] = await Promise.all([
        getExpenses(user.id),
        getSettlements(user.id),
        getFriends(user.id),
      ]);
      setExpenses(expRes.slice(0, 5));
      setFriends(friendRes);

      // Use native Javascript debt simplification engine
      try {
        const calculatedBals = calculateBalances(user.id, expRes, settleRes);
        setBalances(calculatedBals || []);
      } catch (err) {
        console.error('Failed to calculate balances', err);
        setBalances([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalOwed = balances
    .filter((b) => b.amount < 0)
    .reduce((sum, b) => sum + Math.abs(b.amount), 0);
  const totalToReceive = balances
    .filter((b) => b.amount > 0)
    .reduce((sum, b) => sum + b.amount, 0);
  const netBalance = totalToReceive - totalOwed;

  const getFriendName = (userId) => {
    const friend = friends.find((f) => f.id === userId);
    return friend?.name || 'Unknown';
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {user?.name?.split(' ')[0] || 'Friend'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">You owe</p>
                <p className="text-2xl font-bold text-destructive">
                  ₹{totalOwed.toFixed(2)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">You are owed</p>
                <p className="text-2xl font-bold text-primary">
                  ₹{totalToReceive.toFixed(2)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net balance</p>
                <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {netBalance >= 0 ? '+' : ''}₹{netBalance.toFixed(2)}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                netBalance >= 0 ? 'bg-primary/10' : 'bg-destructive/10'
              }`}>
                {netBalance >= 0 ? (
                  <ArrowUpRight className="h-5 w-5 text-primary" />
                ) : (
                  <ArrowDownLeft className="h-5 w-5 text-destructive" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Friend Balances */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Friend Balances</CardTitle>
          </CardHeader>
          <CardContent>
            {balances.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No balances yet. Add friends and create expenses to get started!
              </p>
            ) : (
              <div className="space-y-3">
                {balances.map((balance) => (
                  <div
                    key={balance.user_id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                        {getFriendName(balance.user_id).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">
                        {getFriendName(balance.user_id)}
                      </span>
                    </div>
                    <Badge
                      variant={balance.amount > 0 ? 'default' : 'destructive'}
                      className="font-mono"
                    >
                      {balance.amount > 0 ? '+' : ''}₹{balance.amount.toFixed(2)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Expenses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No expenses yet. Create your first expense!
              </p>
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Receipt className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{expense.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(expense.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">₹{parseFloat(expense.amount).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        paid by {expense.payer_id === user.id ? 'you' : expense.payer_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
