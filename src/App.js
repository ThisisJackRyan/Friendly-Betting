
import './App.css';
import './base.css';
import SignIn from './Components/SignInPage/SignIn';
import CreateAccount from './Components/SignInPage/CreateAccount';
import Header from './Components/Header';
import NotFound from './Components/NotFound';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Welcome from './Components/Welcome';
import CreateMoneyLine from './Components/Bets/MoneyLineBets/CreateMoneyLine';
import CreateOverUnder from './Components/Bets/OverUnderBets/CreateOverUnder';
import CreateProp from './Components/Bets/PropBets/CreateProp';
import DisplayAllBets from './Components/Bets/DisplayAllBets';
import ViewBet from './Components/Bets/ViewBet';







function App() { 
    return (
      <Router>
        <Header />
        <Routes>
          <Route path="Friendly-Betting/" element={<Welcome />} />
          
          <Route path="Friendly-Betting/SignIn" element={ <SignIn />} />
          <Route path="Friendly-Betting/CreateAccount" element={<CreateAccount />} />
          
          <Route path="Friendly-Betting/Bet" element={<DisplayAllBets />} />

          <Route path="Friendly-Betting/MoneyLineBets" element={<CreateMoneyLine />} />
          <Route path="Friendly-Betting/OverUnderBets" element={<CreateOverUnder />} />
          <Route path="Friendly-Betting/PropBets" element={<CreateProp />} />

          <Route path="/Friendly-Betting/Bet/MoneyLineBets/:id" element={<ViewBet />} />
          <Route path="/Friendly-Betting/Bet/OverUnderBets/:id" element={<ViewBet />} />
          <Route path="/Friendly-Betting/Bet/PropBets/:id" element={<ViewBet />} />

          <Route path="/Friendly-Betting/Bet/MoneyLineBets/:id/edit" element={<CreateMoneyLine />} />
          <Route path="/Friendly-Betting/Bet/OverUnderBets/:id/edit" element={<CreateOverUnder />} />
          <Route path="/Friendly-Betting/Bet/PropBets/:id/edit" element={<CreateProp />} />
          
          <Route path="/*" element={<NotFound />} />
        </Routes>
      </Router>
    );
}

export default App;
