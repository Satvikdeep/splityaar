import { collection, doc, setDoc, getDoc, getDocs, query, where, addDoc, serverTimestamp, orderBy, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

// Helper to look up a user by ID and cache it in memory
const userCache = new Map();
export async function getUserById(uid) {
  if (userCache.has(uid)) return userCache.get(uid);
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    const data = { id: snap.id, ...snap.data() };
    userCache.set(uid, data);
    return data;
  }
  return null;
}

export async function checkOrCreateUser(uid, email, name) {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      name,
      email: email.toLowerCase(),
      createdAt: serverTimestamp()
    });
  }
}

// =======================
// GROUPS
// =======================

export async function createGroup(name, currentUserId) {
  const docRef = await addDoc(collection(db, 'groups'), {
    name,
    members: [currentUserId],
    createdBy: currentUserId,
    createdAt: serverTimestamp()
  });
  return { id: docRef.id, name };
}

export async function getGroups(currentUserId) {
  const q = query(collection(db, 'groups'), where('members', 'array-contains', currentUserId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const groups = [];
  for (const d of snap.docs) {
    groups.push({ id: d.id, ...d.data() });
  }
  return groups;
}

export async function getGroup(groupId) {
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) return null;
  const data = snap.data();
  // Resolve member details
  const resolvedMembers = await Promise.all(
    data.members.map(async uid => {
      const u = await getUserById(uid);
      return u ? { id: u.id, name: u.name, email: u.email } : null;
    })
  );
  return {
    id: snap.id,
    ...data,
    resolvedMembers: resolvedMembers.filter(Boolean)
  };
}

export async function joinGroup(groupId, currentUserId) {
  const groupRef = doc(db, 'groups', groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) throw new Error('Group not found');
  
  const data = snap.data();
  if (data.members.includes(currentUserId)) {
    return { id: snap.id, ...data }; // Already joined
  }
  
  await updateDoc(groupRef, {
    members: arrayUnion(currentUserId)
  });
  
  // Make the new member friends with all existing members
  for (const memberId of data.members) {
    if (memberId !== currentUserId) {
      await ensureFriendship(currentUserId, memberId);
    }
  }
  
  return { id: snap.id, ...data, members: [...data.members, currentUserId] };
}

export async function ensureFriendship(uid1, uid2) {
  const qExist = query(
    collection(db, 'friends'),
    where('users', 'array-contains', uid1)
  );
  const existSnap = await getDocs(qExist);
  const exists = existSnap.docs.some(d => d.data().users.includes(uid2));
  
  if (!exists) {
    await addDoc(collection(db, 'friends'), {
      users: [uid1, uid2],
      createdAt: serverTimestamp()
    });
  }
}

export async function addFriend(currentUserId, friendEmail) {
  // Find friend by email
  const q = query(collection(db, 'users'), where('email', '==', friendEmail.toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error('User with this email not found');
  }
  const friendId = snap.docs[0].id;
  const friendInfo = { id: friendId, ...snap.docs[0].data() };

  if (currentUserId === friendId) {
    throw new Error('Cannot add yourself as a friend');
  }

  // Check if already friends
  const qExist = query(
    collection(db, 'friends'),
    where('users', 'array-contains', currentUserId)
  );
  const existSnap = await getDocs(qExist);
  for (const d of existSnap.docs) {
    if (d.data().users.includes(friendId)) {
      throw new Error('Already friends');
    }
  }

  await addDoc(collection(db, 'friends'), {
    users: [currentUserId, friendId],
    createdAt: serverTimestamp()
  });

  return friendInfo; // Return exactly what the UI expects
}

export async function getFriends(currentUserId) {
  const q = query(
    collection(db, 'friends'),
    where('users', 'array-contains', currentUserId)
  );
  const snap = await getDocs(q);
  const friends = [];
  
  for (const d of snap.docs) {
    const friendId = d.data().users.find(u => u !== currentUserId);
    const friendData = await getUserById(friendId);
    if (friendData) {
      friends.push({
        id: friendData.id,
        name: friendData.name,
        email: friendData.email,
        createdAt: friendData.createdAt
      });
    }
  }
  return friends;
}

export async function createExpense(currentUserId, { title, description, amount, payers, participants, date, groupId }) {
  const participant_ids = participants.map(p => p.user_id);
  // Ensure payers are included in participant_ids for querying
  for (const p of payers) {
    if (!participant_ids.includes(p.user_id)) {
      participant_ids.push(p.user_id);
    }
  }

  const docData = {
    title,
    description: description || null,
    amount: parseFloat(amount),
    payers,
    participants,
    participant_ids,
    date: date || new Date().toISOString(),
    createdAt: serverTimestamp()
  };

  if (groupId) {
    docData.groupId = groupId;
  }

  const docRef = await addDoc(collection(db, 'expenses'), docData);
  return { id: docRef.id };
}

export async function getGroupExpenses(groupId) {
  const q = query(
    collection(db, 'expenses'),
    where('groupId', '==', groupId)
  );
  const snap = await getDocs(q);
  const parsed = await parseExpenses(snap);
  // Sort in memory to avoid needing a Firestore composite index
  return parsed.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });
}

// Shared helper to parse expenses snap
async function parseExpenses(snap) {
  const expenses = [];
  for (const d of snap.docs) {
    const raw = d.data();
    
    // Fallback for legacy single-payer records
    const payers = raw.payers || [{ user_id: raw.payer_id, amount: raw.amount }];

    const resolvedPayers = await Promise.all(
      payers.map(async p => {
        const u = await getUserById(p.user_id);
        return { ...p, name: u?.name || 'Unknown', email: u?.email || '' };
      })
    );

    const resolvedParticipants = await Promise.all(
      raw.participants.map(async p => {
        const u = await getUserById(p.user_id);
        return { ...p, name: u?.name || 'Unknown', email: u?.email || '' };
      })
    );

    // Primary payer for simple UI displays
    const primaryPayer = resolvedPayers[0];

    expenses.push({
      id: d.id,
      title: raw.title,
      description: raw.description,
      amount: raw.amount,
      payers: resolvedPayers,
      payer_id: primaryPayer?.user_id, // For backwards compat in simple UIs
      payer_name: resolvedPayers.length > 1 ? `${primaryPayer?.name} + ${resolvedPayers.length - 1}` : primaryPayer?.name,
      payer_email: primaryPayer?.email,
      date: raw.date,
      participants: resolvedParticipants,
      groupId: raw.groupId || null,
      createdAt: raw.createdAt
    });
  }
  return expenses;
}

export async function getExpenses(currentUserId) {
  const q = query(
    collection(db, 'expenses'),
    where('participant_ids', 'array-contains', currentUserId)
  );
  const snap = await getDocs(q);
  const parsed = await parseExpenses(snap);
  
  // Sort in memory to avoid needing a Firestore composite index
  return parsed.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });
}

export async function createSettlement(currentUserId, { receiver_id, amount, date }) {
  const docRef = await addDoc(collection(db, 'settlements'), {
    payer_id: currentUserId,
    receiver_id,
    amount: parseFloat(amount),
    date: date || new Date().toISOString(),
    participant_ids: [currentUserId, receiver_id],
    createdAt: serverTimestamp()
  });
  return { id: docRef.id };
}

export async function getSettlements(currentUserId) {
  const q = query(
    collection(db, 'settlements'),
    where('participant_ids', 'array-contains', currentUserId)
  );
  const snap = await getDocs(q);
  const settlements = [];

  for (const d of snap.docs) {
    const raw = d.data();
    const payer = await getUserById(raw.payer_id);
    const receiver = await getUserById(raw.receiver_id);

    settlements.push({
      id: d.id,
      payer_id: raw.payer_id,
      payer_name: payer?.name || 'Unknown',
      payer_email: payer?.email || '',
      receiver_id: raw.receiver_id,
      receiver_name: receiver?.name || 'Unknown',
      receiver_email: receiver?.email || '',
      amount: raw.amount,
      date: raw.date,
      createdAt: raw.createdAt
    });
  }
  
  return settlements.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });
}
