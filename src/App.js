import './App.css';
import './base.css';
import './phone/phone.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { appBasename } from './phone/routes';
import AppShell from './phone/AppShell';
import TabLayout from './phone/TabLayout';
import TypePicker from './phone/TypePicker';
import CreateForm from './phone/CreateForm';
import MyBets from './phone/MyBets';
import VoteScreen from './phone/VoteScreen';
import TallyScreen from './phone/TallyScreen';
import NotFound from './phone/NotFound';

function App() {
  return (
    <BrowserRouter basename={appBasename()}>
      <div className="app-frame">
        <Routes>
          <Route element={<AppShell />}>
            <Route element={<TabLayout />}>
              <Route path="/" element={<TypePicker />} />
              <Route path="/bets" element={<MyBets />} />
            </Route>
            <Route path="/new/:type" element={<CreateForm />} />
            <Route path="/t/:code" element={<TallyScreen />} />
            <Route path="/Bet/:collection/:id" element={<TallyScreen />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="/b/:code" element={<VoteScreen />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
