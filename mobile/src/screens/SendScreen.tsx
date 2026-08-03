import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { colors, styles as s } from '../theme';

export default function SendScreen() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('USDC');

  const handleSend = () => {
    if (!recipient || !amount) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    Alert.alert('Confirm', `Send ${amount} ${token} to ${recipient.slice(0, 10)}...?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => Alert.alert('Success', 'Transaction submitted!') },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20 }}>
      {/* Token Select */}
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>Token</Text>
      <View style={{ flexDirection: 'row', marginBottom: 20, gap: 8 }}>
        {['USDC', 'USDT', 'DAI', 'EURC'].map((t) => (
          <TouchableOpacity key={t} onPress={() => setToken(t)}
            style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: token === t ? colors.primary : 'rgba(255,255,255,0.05)' }}>
            <Text style={{ color: token === t ? colors.white : colors.textMuted, fontWeight: '600', fontSize: 13 }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recipient */}
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>To</Text>
      <TextInput style={[s.input, { marginBottom: 20, fontFamily: 'monospace', fontSize: 14 }]}
        placeholder="0x... wallet address" placeholderTextColor={colors.textDim}
        value={recipient} onChangeText={setRecipient} />

      {/* Amount */}
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>Amount</Text>
      <View style={{ position: 'relative', marginBottom: 24 }}>
        <TextInput style={[s.input, { fontSize: 28, fontWeight: '700', paddingRight: 80 }]}
          placeholder="0.00" placeholderTextColor={colors.textDim}
          value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <View style={{ position: 'absolute', right: 16, top: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => setAmount('8425.50')}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>MAX</Text></TouchableOpacity>
          <Text style={{ color: colors.textMuted, fontWeight: '600' }}>{token}</Text>
        </View>
      </View>

      {/* Gas Info */}
      <View style={[s.card, { marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.textMuted }}>Network Fee</Text>
        <Text style={{ color: colors.accent, fontWeight: '600' }}>$0.00 (Gasless)</Text>
      </View>

      {/* Send Button */}
      <TouchableOpacity style={s.button} onPress={handleSend}>
        <Text style={s.buttonText}>Send {token}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
