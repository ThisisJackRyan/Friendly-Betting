
import './App.css';
import SignIn from './Components/SignInPage/SignIn';
import CreateAccount from './Components/SignInPage/CreateAccount';
import Header from './Components/Header';
import NewBet from './Components/Bets/NewBet';
import NotFound from './Components/NotFound';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Welcome from './Components/Welcome';






function App() {

  
 
    return (
      <Router>
        <Header />
        <Routes>
          <Route path="Friendly-Betting/" element={<Welcome />} />
          
          <Route path="Friendly-Betting/SignIn" element={ <SignIn />} />
         
          <Route path="Friendly-Betting/CreateAccount" element={<CreateAccount />} />
          <Route path="Friendly-Betting/NewBet" element={<NewBet />} />
          <Route path="/*" element={<NotFound />} />
        </Routes>
      </Router>
    );
}

export default App;
