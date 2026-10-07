import { Outlet, Route, Routes } from 'react-router-dom';
import AppShell from '../src/phone/AppShell';
import { CreateChromeProvider } from '../src/phone/createChrome';
import TabLayout from '../src/phone/TabLayout';
import Landing from '../src/phone/Landing';
import MyBets from '../src/phone/MyBets';
import CreateForm from '../src/phone/CreateForm';
import VoteScreen from '../src/phone/VoteScreen';
import TallyScreen from '../src/phone/TallyScreen';
import NotFound from '../src/phone/NotFound';
import ResultNotifications from '../src/phone/ResultNotifications';
import NativeLifecycle from './NativeLifecycle';

function Chrome() {
  return <CreateChromeProvider><AppShell><Outlet /></AppShell></CreateChromeProvider>;
}

export default function App() {
  return <>
    <NativeLifecycle />
    <div className="app-frame">
      <Routes>
        <Route element={<Chrome />}>
          <Route element={<TabLayout><Outlet /></TabLayout>}>
            <Route index element={<Landing />} />
            <Route path="bets" element={<MyBets />} />
          </Route>
          <Route path="new" element={<CreateForm />} />
          <Route path="new/:type" element={<CreateForm />} />
          <Route path="t/:code" element={<TallyScreen />} />
          <Route path="Bet/:collection/:id" element={<TallyScreen />} />
        </Route>
        <Route path="b/:code" element={<VoteScreen />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
    <ResultNotifications />
  </>;
}
