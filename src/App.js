import { useState } from 'react';
import './App.css';
import CreateNewBet from './Components/CreateNewBet';
import SignIn from './Components/SignIn';
import CreateAccount from './Components/CreateAccount';



function App() {

const [displayCreateNewButton, setDisplayCreateNewButton] = useState(false);

const [signUp, setSignUp] = useState(true);

const toggleForm = () => {
  setSignUp((current) => !current)
}
  return (
    <div className="App">
      <div> header</div> 
      <div className=''>
      
        {(displayCreateNewButton) ? 
          <CreateNewBet /> 
          : 
          <button onClick={() => { setDisplayCreateNewButton((current) => !current)}}>Create New Bet</button>
      
        
        }
        <div>



        {
          signUp ? <SignIn swap = {toggleForm} /> : <CreateAccount swap = {toggleForm} />
        }
        
        </div>
      </div>          
    </div>
  );
}

export default App;
