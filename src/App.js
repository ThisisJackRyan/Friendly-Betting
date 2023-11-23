import { useState } from 'react';
import './App.css';
import CreateNewBet from './Components/CreateNewBet';
import SignIn from './Components/SignIn';
import CreateAccount from './Components/CreateAccount';
import Header from './Components/Header';
import NewBet from './Components/NewBet';




function App() {

const [displayCreateNewButton, setDisplayCreateNewButton] = useState(false);

const [signUp, setSignUp] = useState(true);

const createBet = () => {
  setDisplayCreateNewButton((current) => !current)
}
const toggleForm = () => {
  setSignUp((current) => !current)
}
  return (
    <div className="App">
      <Header  newBet={createBet}/>
      <div>
        {
          signUp ? <SignIn swap = {toggleForm} /> : <CreateAccount swap = {toggleForm} />
        }
        
        
        {(displayCreateNewButton) ? 
          <NewBet />
          : 
          <div>IDK</div>
      
        
        }
      </div>          
    </div>
  );
}

export default App;
