import { useState } from 'react';
import './App.css';
import SignIn from './Components/SignIn';
import CreateAccount from './Components/CreateAccount';
import Header from './Components/Header';
import NewBet from './Components/NewBet';
import NotFound from './Components/NotFound';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Welcome from './Components/MainPages/Welcome';





function App() {

  
 
    return (
      <Router>
        <Header />
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/SignIn" element={<SignIn />} />
          <Route path="/CreateAccount" element={<CreateAccount />} />
          <Route path="/NewBet" element={<NewBet />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    );
}

export default App;
