import { useState } from 'react';
import './App.css';
import SignIn from './Components/SignIn';
import CreateAccount from './Components/CreateAccount';
import Header from './Components/Header';
import NewBet from './Components/NewBet';
import NotFound from './Components/NotFound';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Format from './Components/MainPages/Format';




function App() {

const [displayCreateNewButton, setDisplayCreateNewButton] = useState(false);
 
    return (
      <Router>
        <Header />
        <Routes>
          <Route path="/" element={<Format />} />
          <Route path="/SignIn" element={<SignIn />} />
          <Route path="/CreateAccount" element={<CreateAccount />} />
          <Route path="/NewBet" element={displayCreateNewButton ? <NewBet /> : <NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    );
}

export default App;
