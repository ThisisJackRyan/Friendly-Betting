import React, { useState } from 'react';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';

const CreateMoneyLine = () => {
  const [team, setTeam] = useState('');
  const [odds, setOdds] = useState('');

  const handleTeamChange = (e) => {
    setTeam(e.target.value);
  };

  const handleOddsChange = (e) => {
    setOdds(e.target.value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Logic to create the moneyline bet using the team and odds values
    console.log('Creating moneyline bet:', team, odds);
  };

  return (
    <div className='flex'>
        <div className='x2'>
            <form className={css.MoneyLine} onSubmit={handleSubmit}>
            <div className={css.betContainer}>
                Bet:
                <div className={css.bet}>
                    <textarea type="text" name="" id="" />
                </div>
            </div>
            <div className='flex'>
                <div className={css.contestant}>
                    <div><span className={css.label}>Contestant 1</span></div>
                    <input
                        type="text"
                        name=""
                        value={team}
                        className={css.contestantInput}
                        onChange={handleTeamChange}
                    />
                    <div className={css.odds}>
                        <span>(+ or - odds)</span>
                        <select name="" id="">
                            <option value="nothing">Select...</option>
                            <option value="Contestant2+">+</option>
                            <option value="Contestant2-">-</option>
                        </select>
                        <input type="number" name="" id="" />
                    </div>
                </div>
                <div className={css.contestant}>
                    <div><span className={css.label}>Contestant 2</span></div>
                    <input 
                        type="text"
                        name=""
                        value={team}
                        className={css.contestantInput}
                        onChange={handleTeamChange}
                    /> 
                    <div className={css.odds}>
                        <span>(+ or - odds)</span>
                        <select name="" id="">
                            <option value="nothing">Select...</option>
                            <option value="Contestant2+">+</option>
                            <option value="Contestant2-">-</option>
                        </select>
                        <input type="number" />
                    </div>
                </div>
            </div>
                
            <button type="submit">Create Bet</button>
            </form>
        </div>
        <div className="x1">
            <Players />
        </div>
    </div>
  );
};

export default CreateMoneyLine;
