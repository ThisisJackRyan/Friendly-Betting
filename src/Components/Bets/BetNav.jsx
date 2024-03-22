import React, {useState} from 'react';
import {useNavigate } from 'react-router-dom';
import css from './Bets.module.css';

const BetNav = (props) => {

    const [betType, setBetType] = useState('MoneyLine')

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
    <div className="fixed-center bg-spring-green-light text-black p-4 rounded-md black-border box-shadow-no-hover">
        {/* <div className="x"><span onClick={props.swap} >x</span></div>
        <div className='text-3xl flex justify-center items-center mb-4'><span className='border-bottom'>Bets</span></div>
        <div className="flex justify-center items-center flex-col gap-4 m-4">
            <div>
                <div onClick={goToMoneyLine} className={css.betNavLinks} >Money Line</div>
            </div>
            <div>
                <div onClick={goToOverUnder} className={css.betNavLinks} >Over / Under</div>
            </div>
            <div>
                <div onClick={goToProps} className={css.betNavLinks} >Prop</div>
            </div>
        </div> */}
        <div className='flex justify-end ml-4'>
            <div className="x text-md"><span onClick={props.swap} >x</span></div>
        </div>
        <div className='flex justify-center'>
            <div className=' text-3xl'><span className='border-bottom'>Bets</span></div>
            
            
        </div>
        <div className="flex">
            <div className='flex justify-around my-8 ml-8 flex-col gap-8 text-nowrap'>
                <div onClick={() => {setBetType("MoneyLine")}}>
                    Money Line
                </div>
                <div onClick={() => {setBetType("OverUnder")}}>
                    Over / Under
                </div>
                <div onClick={() => {setBetType("Prop")}}> 
                    Prop
                </div>
            </div>
            <div className='bg-secondary-spring-green-light rounded-md p-4 m-4 ml-24'>
                    {betType === 'MoneyLine' ? 
                        <span>
                        Money Line bet is a type of wager where you place a bet on the outcome of an event with only two possible outcomes. 
                        It's commonly used in sports betting, but can also be applied to other contexts like political elections or entertainment events. 
                        In a Money line bet, you simply choose which side you think will win. The goal is to correctly predict the 
                        winner of the event to receive a payout based on the odds associated with your chosen outcome.
                        </span>
                    : betType === 'OverUnder' ? 
                        <span>
                            An over/under bet, also known as a totals bet, is a type of wager where you bet on the total 
                            combined score of both teams or participants in a game, match, or event. 
                            Rather than betting on the outcome of the game itself,
                            you're betting on whether the total score will be over or under a predetermined number set by the s
                            sports book or betting operator.
                            
                            Lorem ipsum dolor sit amet consectetur adipisicing elit. 

                        </span>
                    : 
                        <span>
                            A prop bet, short for proposition bet, is a type of wager that focuses on specific occurrences or outcomes within a game, 
                            match, or event, rather than the overall result. 
                            These bets can be based on a wide range of scenarios, often unrelated to the final score or outcome of the event. 
                            Prop bets are popular in sports betting, but they can also be found in other contexts such as entertainment events, 
                            politics, and even financial markets</span>
                    }
            </div>
        </div>
    </div>
  );
};

export default BetNav;
