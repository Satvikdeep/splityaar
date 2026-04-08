import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getExpenses } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AddExpenseDialog from '@/components/AddExpenseDialog';
import { Receipt, Calendar, Plus } from 'lucide-react';

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (user) loadExpenses();
  }, [user]);

  const loadExpenses = async () => {
    try {
      const exps = await getExpenses(user.id);
      setExpenses(exps);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExpenseAdded = () => {
    loadExpenses();
    setDialogOpen(false);
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
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground mt-1">
            Track all your shared expenses
          </p>
        </div>
        <AddExpenseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleExpenseAdded}
        />
      </div>

      {/* Expenses List */}
      {expenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No expenses yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first expense to start splitting costs
            </p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {expenses.map((expense) => (
            <Card key={expense.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mt-0.5">
                      <Receipt className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">{expense.title}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(expense.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {expense.participants?.map((p) => (
                          <Badge key={p.user_id} variant="secondary" className="text-xs">
                            {p.user_id === user.id ? 'You' : p.name}: ₹{parseFloat(p.share_amount).toFixed(2)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-lg font-bold">₹{parseFloat(expense.amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      paid by{' '}
                      <span className="font-medium text-foreground">
                        {expense.payer_id === user.id ? 'You' : expense.payer_name}
                      </span>
                    </p>
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
