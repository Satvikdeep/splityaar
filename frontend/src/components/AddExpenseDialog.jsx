import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getFriends, getGroups, getGroup, createExpense } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, Check, Search, Receipt } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AddExpenseDialog({ open, onOpenChange, onSuccess, initialGroupId = null }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  
  // Basic Info
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Context selection (Group vs Individual Friends)
  const [contextType, setContextType] = useState('group'); // 'group' or 'friends'
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId || 'none');
  const [selectedFriends, setSelectedFriends] = useState([]);
  
  // Participants to split with (excluding self theoretically, but logic includes all)
  const [groupMembers, setGroupMembers] = useState([]);
  
  // Payer selection
  // simple object map: { userId: amountPaid }
  const [payers, setPayers] = useState({ [user?.id]: '' });
  
  // Split logic
  const [splitType, setSplitType] = useState('equal'); // 'equal', 'exact', 'percent'
  const [exactSplits, setExactSplits] = useState({});
  const [percentSplits, setPercentSplits] = useState({});
  const [includedInEqual, setIncludedInEqual] = useState({}); // { userId: boolean }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initial Data Load
  useEffect(() => {
    if (user) {
      getFriends(user.id).then(setFriends).catch(console.error);
      getGroups(user.id).then(g => {
        if (!initialGroupId && g.length > 0) {
          // If no initial group, maybe default to none, let user select
        }
        setGroups(g);
      }).catch(console.error);
    }
  }, [user, initialGroupId]);

  useEffect(() => {
    if (initialGroupId) {
      setContextType('group');
      setSelectedGroupId(initialGroupId);
    }
  }, [initialGroupId]);

  // Load group members when a group is selected
  useEffect(() => {
    if (contextType === 'group' && selectedGroupId !== 'none') {
      getGroup(selectedGroupId).then(g => {
        if (g) setGroupMembers(g.resolvedMembers);
      }).catch(console.error);
    }
  }, [contextType, selectedGroupId]);

  // Determine all participants involved in this expense
  const allParticipants = contextType === 'group' && selectedGroupId !== 'none'
    ? groupMembers
    : [
        { id: user.id, name: 'You' },
        ...selectedFriends.map(fid => friends.find(f => f.id === fid)).filter(Boolean)
      ];

  // Initialize equal split inclusions and exact/percent splits when participants change
  useEffect(() => {
    const defaultIncluded = {};
    const defaultExact = {};
    const defaultPercent = {};
    allParticipants.forEach(p => {
      defaultIncluded[p.id] = true;
      if (!exactSplits[p.id]) defaultExact[p.id] = '';
      if (!percentSplits[p.id]) defaultPercent[p.id] = '';
    });
    setIncludedInEqual(defaultIncluded);
    setExactSplits(prev => ({ ...defaultExact, ...prev }));
    setPercentSplits(prev => ({ ...defaultPercent, ...prev }));
    
    // Also default payer to just me if not set or invalid
    if (Object.keys(payers).length === 0) {
      setPayers({ [user.id]: '' });
    }
  }, [allParticipants.length]);

  const toggleFriend = (friendId) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
  };

  const toggleEqualInclusion = (uid) => {
    setIncludedInEqual(prev => ({...prev, [uid]: !prev[uid]}));
  };

  const activeEqualCount = Object.values(includedInEqual).filter(Boolean).length;
  const equalShare = amount && activeEqualCount > 0 
    ? (parseFloat(amount) / activeEqualCount).toFixed(2) 
    : '0.00';

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setSelectedFriends([]);
    setPayers({ [user?.id]: '' });
    setSplitType('equal');
    setExactSplits({});
    setPercentSplits({});
    if (!initialGroupId) {
      setSelectedGroupId('none');
      setContextType('friends');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const totalAmount = parseFloat(amount || 0);
    if (!totalAmount || totalAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }

    if (allParticipants.length < 1) {
      setError('Select participants');
      return;
    }

    // Process Payers
    // If only one person is paying, we just set their amount to the totalAmount
    // But UI lets us choose multiple theoretically. Here we assume standard Splitwise:
    // If one payer is selected from standard dropdown, they pay the whole amount.
    // If we support multiple payers, the inputs must sum to totalAmount.
    let finalPayers = [];
    const payerKeys = Object.keys(payers);
    if (payerKeys.length === 1) {
      finalPayers = [{ user_id: payerKeys[0], amount: totalAmount }];
    } else {
      let sumPaid = 0;
      for (const k of payerKeys) {
        const val = parseFloat(payers[k] || 0);
        if (val > 0) {
          finalPayers.push({ user_id: k, amount: val });
          sumPaid += val;
        }
      }
      if (Math.abs(sumPaid - totalAmount) > 0.01) {
        setError(`Paid amounts (₹${sumPaid.toFixed(2)}) must equal total (₹${totalAmount.toFixed(2)})`);
        return;
      }
    }

    // Process Participants
    const finalParticipants = [];
    
    if (splitType === 'equal') {
      const perPerson = totalAmount / activeEqualCount;
      allParticipants.forEach(p => {
        if (includedInEqual[p.id]) {
          finalParticipants.push({ user_id: p.id, share_amount: perPerson });
        } else {
          finalParticipants.push({ user_id: p.id, share_amount: 0 }); // They owe 0
        }
      });
    } else if (splitType === 'exact') {
      let totalExact = 0;
      allParticipants.forEach(p => {
        const val = parseFloat(exactSplits[p.id] || 0);
        finalParticipants.push({ user_id: p.id, share_amount: val });
        totalExact += val;
      });
      if (Math.abs(totalExact - totalAmount) > 0.01) {
        setError(`Exact splits (₹${totalExact.toFixed(2)}) must equal total (₹${totalAmount.toFixed(2)})`);
        return;
      }
    } else if (splitType === 'percent') {
      let totalPercent = 0;
      allParticipants.forEach(p => {
        const pct = parseFloat(percentSplits[p.id] || 0);
        const val = totalAmount * (pct / 100);
        finalParticipants.push({ user_id: p.id, share_amount: val });
        totalPercent += pct;
      });
      if (Math.abs(totalPercent - 100) > 0.01) {
        setError(`Percentages (${totalPercent}%) must equal 100%`);
        return;
      }
    }

    setLoading(true);
    try {
      await createExpense(user.id, {
        title,
        amount: totalAmount,
        payers: finalPayers,
        participants: finalParticipants,
        date,
        groupId: selectedGroupId !== 'none' ? selectedGroupId : null,
      });
      
      resetForm();
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  };

  const [activeScreen, setActiveScreen] = useState('main'); // 'main' | 'split'

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        resetForm();
        setActiveScreen('main');
      }
      onOpenChange(isOpen);
    }}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700 font-medium shadow-md">
          <Receipt className="h-4 w-4 mr-2" />
          Add expense
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => {
        // Prevent closing the modal when clicking outside if we're deeply interacting
        if (activeScreen === 'split') e.preventDefault();
      }}>
        {activeScreen === 'main' && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Add an expense</DialogTitle>
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 mt-2">
              
              {!initialGroupId && (
                 <div className="flex items-center border-b pb-4 gap-2 text-sm">
                   <span>With <strong>you</strong> and:</span>
                   <Select value={contextType === 'group' && selectedGroupId !== 'none' ? selectedGroupId : 'friends'} onValueChange={(val) => {
                     if (val === 'friends') {
                       setContextType('friends');
                       setSelectedGroupId('none');
                     } else {
                       setContextType('group');
                       setSelectedGroupId(val);
                     }
                   }}>
                     <SelectTrigger className="w-auto border-none h-8 bg-muted/50 font-semibold rounded-full flex-1">
                       <SelectValue placeholder="Click to select..." />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="friends">Specific Friends</SelectItem>
                       {groups.map(g => (
                         <SelectItem key={g.id} value={g.id}>All of {g.name}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
              )}

              {contextType === 'friends' && selectedGroupId === 'none' && (
                <div className="space-y-2">
                  <Label>Select friends</Label>
                  <div className="flex flex-wrap gap-2">
                    {friends.map((friend) => (
                      <Badge
                        key={friend.id}
                        variant={selectedFriends.includes(friend.id) ? 'default' : 'outline'}
                        className="cursor-pointer transition-colors"
                        onClick={() => toggleFriend(friend.id)}
                      >
                        {friend.name}
                      </Badge>
                    ))}
                  </div>
                  {friends.length === 0 && (
                     <p className="text-xs text-muted-foreground">Add friends first to split expenses</p>
                  )}
                </div>
              )}

              <div className="flex gap-4">
                <div className="flex flex-col gap-4">
                   <div className="h-12 w-12 border rounded shadow-sm flex items-center justify-center text-emerald-600 bg-emerald-50 mt-1">
                     <Receipt className="h-6 w-6" />
                   </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <Input
                      className="border-0 border-b-2 border-emerald-500 rounded-none px-0 text-lg shadow-none focus-visible:ring-0"
                      placeholder="Enter a description"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2 border-b-2 border-muted-foreground focus-within:border-emerald-500 transition-colors">
                    <span className="text-xl font-medium">₹</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="border-0 rounded-none px-0 text-3xl h-12 shadow-none focus-visible:ring-0 font-medium"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="text-center text-sm mt-4 font-medium p-4 bg-muted/40 rounded-lg">
                 Paid by{' '}
                 <Select 
                   value={Object.keys(payers).length === 1 ? Object.keys(payers)[0] : 'multiple'} 
                   onValueChange={(val) => {
                     if (val !== 'multiple') {
                       setPayers({ [val]: '' });
                     }
                   }}
                 >
                   <SelectTrigger className="inline-flex h-7 w-auto px-2 font-bold text-emerald-700 bg-emerald-100 border-none rounded focus:ring-0">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     {allParticipants.map(p => (
                       <SelectItem key={p.id} value={p.id}>{p.id === user.id ? 'you' : p.name.split(' ')[0]}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 {' '}and split{' '}
                 <button 
                   type="button"
                   onClick={() => setActiveScreen('split')}
                   disabled={allParticipants.length === 0 || !amount}
                   className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded ml-1 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                 >
                   {splitType === 'equal' ? 'equally' : splitType === 'percent' ? 'by percentage' : 'exactly'}
                 </button>
              </div>

              <div className="flex items-center gap-4 text-muted-foreground text-sm">
                 <Label htmlFor="expense-date" className="sr-only">Date</Label>
                 <Input
                   id="expense-date"
                   type="date"
                   value={date}
                   onChange={(e) => setDate(e.target.value)}
                   required
                   className="w-auto h-8 text-sm"
                 />
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-center font-medium">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 font-medium"
                disabled={loading || allParticipants.length === 0}
              >
                {loading ? 'Saving...' : 'Save expense'}
              </Button>
            </form>
          </>
        )}

        {/* SPLIT OPTIONS MODAL SCREEN */}
        {activeScreen === 'split' && (
          <div className="flex flex-col h-full space-y-4">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Split options</DialogTitle>
                <div className="text-sm font-medium text-muted-foreground mr-4">Total: ₹{parseFloat(amount).toFixed(2)}</div>
              </div>
            </DialogHeader>
            
            <div className="flex-1 mt-4">
              <Tabs defaultValue="equal" value={splitType} onValueChange={setSplitType} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="equal" className="font-bold text-lg">=</TabsTrigger>
                  <TabsTrigger value="exact" className="font-bold">1.23</TabsTrigger>
                  <TabsTrigger value="percent" className="font-bold">%</TabsTrigger>
                </TabsList>
                
                <TabsContent value="equal" className="mt-6 space-y-2">
                  <p className="text-center text-sm font-medium text-muted-foreground mb-6">Select which people owe an equal share.</p>
                  <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-2">
                    {allParticipants.map(p => (
                       <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => toggleEqualInclusion(p.id)}>
                          <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                               {p.name[0]}
                             </div>
                             <span className="text-sm font-semibold">{p.id === user.id ? 'You' : p.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                             {includedInEqual[p.id] && <span className="text-sm font-mono text-muted-foreground">₹{equalShare}</span>}
                             <div className={`h-6 w-6 rounded-full border flex items-center justify-center transition-colors ${includedInEqual[p.id] ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-muted-foreground text-transparent'}`}>
                               <Check className="h-4 w-4" />
                             </div>
                          </div>
                       </div>
                    ))}
                  </div>
                  <div className="text-center pt-4 text-sm font-bold text-emerald-600">
                    ₹{equalShare}/person ({activeEqualCount} people)
                  </div>
                </TabsContent>

                <TabsContent value="exact" className="mt-6 space-y-2">
                  <p className="text-center text-sm font-medium text-muted-foreground mb-6">Enter exactly how much each person owes.</p>
                  <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-2">
                    {allParticipants.map(p => (
                       <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                               {p.name[0]}
                             </div>
                             <span className="text-sm font-semibold">{p.id === user.id ? 'You' : p.name}</span>
                          </div>
                          <div className="flex items-center gap-2 border-b-2 border-muted-foreground focus-within:border-emerald-500 w-28 transition-colors">
                             <span className="text-sm text-emerald-600 font-bold">₹</span>
                             <Input
                               type="number"
                               min="0"
                               step="0.01"
                               placeholder="0.00"
                               className="border-0 h-8 px-1 text-right shadow-none focus-visible:ring-0 font-mono font-bold text-lg"
                               value={exactSplits[p.id] || ''}
                               onChange={(e) => setExactSplits(prev => ({...prev, [p.id]: e.target.value}))}
                             />
                          </div>
                       </div>
                    ))}
                  </div>
                  <div className="text-center pt-4 text-sm font-bold text-muted-foreground">
                    Total entered: ₹{Object.values(exactSplits).reduce((s, v) => s + parseFloat(v || 0), 0).toFixed(2)} of ₹{parseFloat(amount).toFixed(2)}
                  </div>
                </TabsContent>

                <TabsContent value="percent" className="mt-6 space-y-2">
                  <p className="text-center text-sm font-medium text-muted-foreground mb-6">Enter the percentage each person owes.</p>
                  <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-2">
                    {allParticipants.map(p => (
                       <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                               {p.name[0]}
                             </div>
                             <span className="text-sm font-semibold">{p.id === user.id ? 'You' : p.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                             <span className="text-sm text-emerald-600 font-bold font-mono">
                               ₹{((parseFloat(percentSplits[p.id] || 0) / 100) * parseFloat(amount)).toFixed(2)}
                             </span>
                             <div className="flex items-center gap-2 border-b-2 border-muted-foreground focus-within:border-emerald-500 w-24 transition-colors">
                               <Input
                                 type="number"
                                 min="0"
                                 max="100"
                                 step="0.1"
                                 placeholder="0"
                                 className="border-0 h-8 px-1 text-right shadow-none focus-visible:ring-0 font-mono font-bold text-lg"
                                 value={percentSplits[p.id] || ''}
                                 onChange={(e) => setPercentSplits(prev => ({...prev, [p.id]: e.target.value}))}
                               />
                               <span className="text-sm text-emerald-600 font-bold">%</span>
                             </div>
                          </div>
                       </div>
                    ))}
                  </div>
                  <div className="text-center pt-4 text-sm font-bold text-muted-foreground">
                    Total: {Object.values(percentSplits).reduce((s, v) => s + parseFloat(v || 0), 0).toFixed(1)}% of 100%
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            
            <div className="pt-4 mt-6 border-t">
               <Button onClick={() => setActiveScreen('main')} className="w-full bg-slate-800 hover:bg-slate-900">
                 Confirm Split
               </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
