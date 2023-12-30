
import './App.css';
import SignIn from './Components/SignInPage/SignIn';
import CreateAccount from './Components/SignInPage/CreateAccount';
import Header from './Components/Header';
import NewBet from './Components/Bets/NewBet';
import NotFound from './Components/NotFound';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Welcome from './Components/Welcome';
import MoneyLine from './Components/Bets/MoneyLineBets/MoneyLine';
import OverUnder from './Components/Bets/OverUnderBets/OverUnder';
import Prop from './Components/Bets/PropBets/Prop';
import ViewMoneyLine from './Components/Bets/MoneyLineBets/ViewMoneyLine';
import ViewOverUnder from './Components/Bets/OverUnderBets/ViewOverUnder';
import ViewProp from './Components/Bets/PropBets/ViewProp';






function App() {

  
 
    return (
      <Router>
        <Header />
        <Routes>
          <Route path="Friendly-Betting/" element={<Welcome />} />
          
          <Route path="Friendly-Betting/SignIn" element={ <SignIn />} />
         
          <Route path="Friendly-Betting/CreateAccount" element={<CreateAccount />} />
          <Route path="Friendly-Betting/NewBet" element={<NewBet />} />

          <Route path="Friendly-Betting/MoneyLineBets" element={<MoneyLine />} />
          <Route path="Friendly-Betting/OverUnderBets" element={<OverUnder />} />
          <Route path="Friendly-Betting/PropBets" element={<Prop />} />

          <Route path="/Friendly-Betting/Bet/MoneyLineBets/" element={<ViewMoneyLine />} />
          <Route path="/Friendly-Betting/Bet/OverUnderBets/" element={<ViewOverUnder />} />
          <Route path="/Friendly-Betting/Bet/PropBets/" element={<ViewProp />} />



          <Route path="/*" element={<NotFound />} />
        </Routes>
      </Router>
    );
}

export default App;
