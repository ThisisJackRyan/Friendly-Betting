import './App.css';
import './base.css';
import './phone/phone.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { appBasename } from './phone/routes';
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
          <Route element={<TabLayout />}>
            <Route path="/" element={<TypePicker />} />
            <Route path="/bets" element={<MyBets />} />
          </Route>
          <Route path="/new/:type" element={<CreateForm />} />
          <Route path="/b/:code" element={<VoteScreen />} />
          <Route path="/t/:code" element={<TallyScreen />} />
          <Route path="/Bet/:collection/:id" element={<TallyScreen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
