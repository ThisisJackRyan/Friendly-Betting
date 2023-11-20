import { useState } from 'react';
import './App.css';
import CreateNewBet from './Components/CreateNewBet';



function App() {

const [displayCreateNewButton, setDisplayCreateNewButton] = useState(false);

  return (
    <div className="App">
      <div> header</div> 
      <div className='flex'>
        <div className='x2'>
          {(displayCreateNewButton) ? 
            <CreateNewBet /> 
            : 
            <button onClick={() => { setDisplayCreateNewButton((current) => !current)}}>Create New Bet</button>
        
          
          }
          <div>
            
          </div>
        </div>
        <div className='x1'>
          add friends
          <div>Profile ID</div>
          <div>Number</div>
          <div>
            <button>Add Friend</button>
          </div>
        </div>

      </div>          
    </div>
  );
}

export default App;
