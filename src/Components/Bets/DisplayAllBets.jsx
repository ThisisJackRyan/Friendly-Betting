import React from 'react';
import { useState } from 'react';
import BetNav from './BetNav';


const DisplayAllBets = () => {

    const [json, setJson] = useState("")
    const [display, setDisplay] = useState(false)

    const addJson = (newJson) => {

    }
    const swapDisplay = () => {
        setDisplay((current) => !current)
    }
  return (
    <div>
      {json === "" ? (
        <div>
          <h3>You are not in any bets yet</h3>
          <button onClick={swapDisplay}>Create One!</button>
          {display ? <BetNav /> : null}

        </div>
      ) : (
        <div>
          <h3>There are bets!</h3>
        </div>
      ) }
    </div>
  );
}

export default DisplayAllBets;
