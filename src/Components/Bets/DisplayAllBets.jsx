import React from 'react';
import { useState } from 'react';


const DisplayAllBets = () => {

    const [json, setJson] = useState("")
    const [display, setDisplay] = useState(false)

    const addJson = (newJson) => {

    }
  return (
    <div>
      {json === "" ? (
        <div>
          <h3>You are not in any bets yet</h3>
          <button>Create One!</button>

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
