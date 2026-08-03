import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import SendScreen from './src/screens/SendScreen';
import SwapScreen from './src/screens/SwapScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import AIScreen from './src/screens/AIScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '🏠', Send: '💸', Swap: '🔄', Portfolio: '📊', AI: '🤖',
  };
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>{icons[label] || '•'}</Text>
      <Text style={{ fontSize: 10, color: focused ? '#14b8a6' : '#64748b', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#020617' },
          headerTintColor: '#e2e8f0',
          tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: 'rgba(20,184,166,0.15)', height: 70, paddingBottom: 8, paddingTop: 8 },
          tabBarActiveTintColor: '#14b8a6',
          tabBarInactiveTintColor: '#64748b',
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false, tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }} />
        <Tab.Screen name="Send" component={SendScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="Send" focused={focused} /> }} />
        <Tab.Screen name="Swap" component={SwapScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="Swap" focused={focused} /> }} />
        <Tab.Screen name="Portfolio" component={PortfolioScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="Portfolio" focused={focused} /> }} />
        <Tab.Screen name="AI Assistant" component={AIScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="AI" focused={focused} /> }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
