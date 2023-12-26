import React from 'react';
import {useNavigate } from 'react-router-dom';

const BetNav = (props) => {
    const navigate = useNavigate();

    const goToMoneyLine = () => {
        navigate('/Friendly-Betting/MoneyLineBets')
    }
    const goToOverUnder = () => {
        navigate('/Friendly-Betting/OverUnderBets')
    }
    const goToProps = () => {
        navigate('/Friendly-Betting/PropBets')
    }
  return (
    <div className='betNav'>
        <div className='x'><span onClick={props.swap} >x</span></div>
        <h1><span>Bets</span></h1>
        <div className='BettingLinks'>
            <div>
                <div onClick={goToMoneyLine} className='Link' >Money Line Bets</div>
            </div>
            <div>
                <div onClick={goToOverUnder} className='Link' >Over / Under Bets</div>
            </div>
            <div>
                <div onClick={goToProps} className='Link' >Prop Bets</div>
            </div>
        </div>
    </div>
  );
};

export default BetNav;
