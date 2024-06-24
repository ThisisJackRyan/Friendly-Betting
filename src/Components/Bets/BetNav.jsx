import React, {useState} from 'react';
import {useNavigate } from 'react-router-dom';
import css from './Bets.module.css';
import { Link } from 'react-router-dom';
import { BsCaretDownFill, BsCaretUpFill} from "react-icons/bs";
import { CSSTransition } from 'react-transition-group';
import Logo from '../Components/Static/Logo';

const BetNav = (props) => {

    const [isOpenMoneyLine, setIsOpenMoneyLine] = useState(false);
    const [isOpenOverUnder, setIsOpenOverUnder] = useState(false);
    const [isOpenProp, setIsOpenProp] = useState(false);

    const navigate = useNavigate();

    const goTo = (bet) => {
        navigate(`/Friendly-Betting/${bet}`)

    }
  return (
    
    <div className='fixed h-full top-0 bottom-0 left-0 right-0 bg-spring-green-light'>
        <Logo />
        <div className='flex justify-center items-start mt-24 h-full'>
            {/* Make this a drop down that displays description... look at meta's website */}
            <div className='flex justify-around my-8 ml-8 flex-col gap-8 text-nowrap'>
                <div className='cursor-pointer flex flex-col justify-center items-center w-full max-w-64'>

                    <button className=" w-full flex justify-between items-center border-4 rounded-lg p-2 m-2 bg-secondary-spring-green-light    active:border-gray-50 duration-300 active:text-gray-50" onClick={() => setIsOpenMoneyLine(!isOpenMoneyLine)} >
                        Money Line
                        <div className='flex justify-center items-center'>
                            {isOpenMoneyLine ? <BsCaretUpFill className='flex justify-center items-center' /> : <BsCaretDownFill className='lex justify-center items-center' />}
                        </div>
                    </button>
                    <CSSTransition
                        in={isOpenMoneyLine}
                        timeout={300}
                        classNames="fadeDown"
                        unmountOnExit              
                    >
                        <div>
                            <div className='relative flex justify-center items-center  border-4 rounded-lg bg-secondary-spring-green-light'>
                                <span  className=' break-words whitespace-normal flex justify-center items-center p-2'>
                                Money Line bet is a type of wager where you place a bet on the outcome of an event with only two possible outcomes. 
                                In a Money line bet, you simply choose which side you think will win. 
                                </span>
                            </div>
                            <button className='flex justify-center w-full bg-blue-gray border-4 rounded-lg p-2 text-white active:border-gray-50' onClick={() => goTo("MoneyLineBets")}>
                                <span>
                                    Create One!
                                </span>
                            </button>
                        </div>
                    </CSSTransition>

                </div>
                <div className={`cursor-pointer flex flex-col justify-center items-center w-full max-w-64 transition duration-75 ease-in-out ${isOpenMoneyLine ? css.moveSouth : "delay-300"}`}>

                    <button className=" w-full flex justify-between items-center border-4 rounded-lg p-2 m-2 bg-secondary-spring-green-light active:border-gray-50 duration-300 active:text-gray-50" onClick={() => setIsOpenOverUnder(!isOpenOverUnder)}>
                        Over / Under
                        <div className='flex justify-center items-center'>
                            {isOpenOverUnder ? <BsCaretUpFill className='flex justify-center items-center' /> : <BsCaretDownFill className='lex justify-center items-center' />}
                        </div>
                    </button>
                    <CSSTransition
                        in={isOpenOverUnder}
                        timeout={300}
                        classNames="fadeDown"
                        unmountOnExit              
                    >
                        <div>
                            <div className='relative flex justify-center items-center  border-4 rounded-lg bg-secondary-spring-green-light'>
                                <span  className=' break-words whitespace-normal flex justify-center items-center p-2'>
                                An over/under bet is a wager where you bet on if the combined 
                                score of both teams or participants in a game, match, or event will be OVER or UNDER a predetermined number.
                                </span>
                            </div>
                            <button className='flex justify-center w-full bg-blue-gray border-4 rounded-lg p-2 text-white active:border-gray-50' onClick={() => goTo("OverUnderBets")}>
                                <span>
                                    Create One!
                                </span>
                            </button>
                        </div>
                    </CSSTransition>

                </div>
                <div className={`cursor-pointer flex flex-col justify-center items-center w-full max-w-64 transition duration-75 ease-in-out ${isOpenMoneyLine || isOpenOverUnder ? css.moveSouth : "delay-300"}`}>

                    <button className=" w-full flex justify-between items-center border-4 rounded-lg p-2 m-2 bg-secondary-spring-green-light active:border-gray-50 duration-300 active:text-gray-50" onClick={() => setIsOpenProp(!isOpenProp)} >
                        Prop (Not Implemented)
                        <div className='flex justify-center items-center'>
                            {isOpenProp ? <BsCaretUpFill className='flex justify-center items-center' /> : <BsCaretDownFill className='lex justify-center items-center' />}
                        </div>
                    </button>
                    <CSSTransition
                        in={isOpenProp}
                        timeout={300}
                        classNames="fadeDown"
                        unmountOnExit              
                    >
                        <div>
                            <div className='relative flex justify-center items-center  border-4 rounded-lg bg-secondary-spring-green-light'>
                                <span  className=' break-words whitespace-normal flex justify-center items-center p-2'>
                                A prop bet is wager that focuses on specific occurrences within a game, 
                                match, or event. Betters place bets on things like, the coin toss and the first team to score 
                                or anything you can thing of!
                                </span>
                            </div>
                            <button className='flex justify-center w-full bg-blue-gray border-4 rounded-lg p-2 text-white active:border-gray-50' onClick={() => goTo("PropBets")}>
                                <span>
                                    Create One!
                                </span>
                            </button>
                        </div>
                    </CSSTransition>
                </div>
                <div className="flex w-full justify-center items-center bg-blue-gray text-white rounded-md box-shadow py-2" onClick={props.swap}>
                    Close
                </div>
            </div>
        </div>
    </div>




    // <div className="fixed-center bg-spring-green-light text-black p-4 rounded-md black-border box-shadow-no-hover">
    //     <div className='flex justify-end ml-4'>
    //         <div className="x text-md"><span onClick={props.swap} >x</span></div>
    //     </div>
    //     <div className='flex justify-center'>
    //         <div className=' text-3xl'><span className='border-bottom'>Bets</span></div>      
    //     </div>
    //     <div className="flex">
    //         <div className='flex justify-around my-8 ml-8 flex-col gap-8 text-nowrap'>
    //             <div className="cursor-pointer" onClick={() => goTo("MoneyLineBets")} onMouseEnter={() => {setBetType("MoneyLineBets")}}>
    //                 Money Line
    //             </div>
    //             <div className="cursor-pointer" onClick={() => goTo("OverUnderBets")} onMouseEnter={() => {setBetType("OverUnderBets")}}>
    //                 Over / Under
    //             </div>
    //             <div className="cursor-pointer" onClick={() => goTo("PropBets")} onMouseEnter={() => {setBetType("PropBets")}}> 
    //                 Prop (Not Implemented Yet)
    //             </div>
    //         </div>
    //         <div className={`bg-secondary-spring-green-light rounded-md p-4 m-4 ml-24 max-h-96 ${css.betDescriptions}`}>
    //                 { 
    //                     betType === 'OverUnderBets' ? 
    //                         <span>
    //                             An over/under bet, also known as a totals bet, is a type of wager where you bet on the total 
    //                             combined score of both teams or participants in a game, match, or event. 
    //                             Rather than betting on the outcome of the game itself,
    //                             you're betting on whether the total score will be over or under a predetermined number set by the
    //                             sports book or betting operator.
    //                         </span>
    //                     : betType === 'PropBets' ? 
    //                         <span>
    //                             A prop bet, short for proposition bet, is a type of wager that focuses on specific occurrences or outcomes within a game, 
    //                             match, or event, rather than the overall result. 
    //                             These bets can be based on a wide range of scenarios, often unrelated to the final score or outcome of the event. 
    //                             Prop bets are popular in sports betting, but they can also be found in other contexts such as entertainment events, 
    //                             politics, and even financial markets
    //                         </span>
    //                     : 
    //                         <span>
    //                             Money Line bet is a type of wager where you place a bet on the outcome of an event with only two possible outcomes. 
    //                             It's commonly used in sports betting, but can also be applied to other contexts like political elections or entertainment events. 
    //                             In a Money line bet, you simply choose which side you think will win. The goal is to correctly predict the 
    //                             winner of the event to receive a payout based on the odds associated with your chosen outcome.
    //                         </span>
    //                 }
    //         </div>
    //     </div>
    // </div>
  );
};

export default BetNav;
